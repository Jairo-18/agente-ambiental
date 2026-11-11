import { Injectable } from '@nestjs/common';
import { ConocimientoService } from '../../conocimiento/services/conocimiento.service';
import { ClasificacionService } from '../../reportes-ciudadanos/services/clasificacion.service';
import { DatosReporte, ReportesCiudadanosService } from '../../reportes-ciudadanos/services/reportes-ciudadanos.service';
import { DatosService } from '../../datos/services/datos.service';
import { EvaluacionesService } from '../../evaluaciones/services/evaluaciones.service';
import { NormaService } from '../../norma/services/norma.service';
import { ReportesService } from '../../reportes/services/reportes.service';
import { CONTAMINANTES, PERIODO_REGEX } from '../../shared/constants/aire.constants';
import { mesTexto } from '../../shared/utils/fechas.util';
import { HERRAMIENTAS } from '../constants/asistente.constants';
import { ConfirmacionesService } from './confirmaciones.service';

export type ResultadoHerramienta = Record<string, any>;

const error = (mensaje: string): ResultadoHerramienta => ({ error: mensaje });
const PROMEDIOS = ['1h', '8h', '24h'];
const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

/** Lo que trae el turno además del texto: evidencias adjuntas y si el ciudadano habló (voz) o escribió. */
export interface ContextoTurno {
  evidencias: string[];
  canal: 'texto' | 'voz';
  /** Lo que dijo el ciudadano desde el último registro: las reglas lo leen además del resumen del modelo. */
  textoCiudadano?: string;
}

/**
 * Las herramientas del agente. Son fijas y cada una llama a código determinista ya probado: no hay herramienta para
 * ejecutar comandos ni para escribir rutas. Cualquier fallo vuelve como `{ error }` para que el modelo (y el usuario)
 * lo vean, nunca como una excepción que tumbe la conversación.
 */
@Injectable()
export class HerramientasService {
  constructor(
    private readonly datos: DatosService,
    private readonly reportes: ReportesService,
    private readonly evaluaciones: EvaluacionesService,
    private readonly norma: NormaService,
    private readonly confirmaciones: ConfirmacionesService,
    private readonly ciudadanos: ReportesCiudadanosService,
    private readonly clasificacion: ClasificacionService,
    private readonly conocimiento: ConocimientoService,
  ) {}

  /** Evidencias y canal del mensaje actual: el registro de un reporte las usa. */
  contexto: ContextoTurno = { evidencias: [], canal: 'texto' };

  nombres(): string[] {
    return HERRAMIENTAS.map((h) => h.function.name);
  }

  async ejecutar(nombre: string, args: unknown): Promise<ResultadoHerramienta> {
    const def = HERRAMIENTAS.find((h) => h.function.name === nombre);
    if (!def) return error(`Herramienta desconocida: ${nombre}. Disponibles: ${this.nombres().join(', ')}.`);
    if (!args || typeof args !== 'object' || Array.isArray(args)) return error('Los argumentos deben ser un objeto JSON.');

    const a = args as Record<string, any>;
    const props = Object.keys((def.function.parameters as { properties: object }).properties);
    const requeridos = ((def.function.parameters as { required?: string[] }).required ?? []).filter((r) => a[r] === undefined);
    const sobran = Object.keys(a).filter((k) => !props.includes(k));
    if (sobran.length || requeridos.length) {
      return error(`Argumentos incorrectos para ${nombre}: ${[...sobran.map((s) => `'${s}' no existe`), ...requeridos.map((r) => `falta '${r}'`)].join(', ')}.`);
    }
    try {
      switch (nombre) {
        case 'listar_archivos_de_datos':
          return { archivos: await this.datos.listar() };
        case 'revisar_datos':
          return { ...(await this.reportes.revisar(a.archivo, a.periodo)) };
        case 'evaluar_valor':
          return await this.evaluar(a); // con await: si no, un error asíncrono se escaparía del try/catch
        case 'generar_reporte':
          return await this.generar(a);
        case 'consultar_reporte':
          return this.reportes.consultar(a.periodo, a.estacion, a.contaminante);
        case 'consultar_norma':
          return await this.consultarNorma(a.pregunta);
        case 'registrar_reporte_ciudadano':
          return await this.registrarReporte(a);
        case 'consultar_reporte_ciudadano':
          return { ...(await this.ciudadanos.consultar(texto(a.radicado))) };
      }
    } catch (e) {
      return error((e as Error).message);
    }
    return error(`Herramienta sin implementar: ${nombre}`);
  }

  private async evaluar(a: Record<string, any>): Promise<ResultadoHerramienta> {
    if (!(CONTAMINANTES as readonly string[]).includes(a.contaminante)) return error(`Contaminante '${a.contaminante}' desconocido. Opciones: ${CONTAMINANTES.join(', ')}.`);
    if (!PROMEDIOS.includes(a.promedio)) return error(`Promedio '${a.promedio}' desconocido. Opciones: ${PROMEDIOS.join(', ')}.`);
    const valor = typeof a.valor === 'number' ? a.valor : Number(a.valor);
    if (!Number.isFinite(valor)) return error(`El valor '${a.valor}' no es un número.`);
    return { ...(await this.evaluaciones.evaluar({ contaminante: a.contaminante, promedio: a.promedio, valor, unidad: a.unidad || 'µg/m3' })) };
  }

  /** Si el mes ya tiene reporte, la confirmación la da una persona: el modelo no puede saltarse esto. */
  private async generar(a: Record<string, any>): Promise<ResultadoHerramienta> {
    if (!PERIODO_REGEX.test(String(a.periodo))) return error(`Periodo '${a.periodo}' inválido; el formato es AAAA-MM, por ejemplo 2026-10.`);
    if (this.reportes.existe(a.periodo)) {
      const ok = await this.confirmaciones.preguntar(`Ya existe el reporte de ${mesTexto(a.periodo)}. ¿Lo sobrescribo?`);
      if (!ok) return { generado: false, motivo: 'El usuario no confirmó sobrescribir el reporte existente.' };
    }
    return { ...(await this.reportes.generar({ archivo: a.archivo, periodo: a.periodo, conLlm: a.con_llm !== false })) };
  }

  /**
   * Registra un reporte ciudadano. Lo que falte vuelve como error para que el modelo lo pregunte; con todo completo, el
   * sistema analiza (reglas) y una PERSONA confirma antes de guardar. El modelo nunca decide prioridad ni entidad.
   */
  private async registrarReporte(a: Record<string, any>): Promise<ResultadoHerramienta> {
    const datos: DatosReporte = {
      descripcion: texto(a.descripcion), direccion: texto(a.direccion), localidad: texto(a.localidad) || null, barrio: texto(a.barrio) || null,
      cuando: texto(a.cuando) || null, enCurso: a.en_curso === true || a.en_curso === 'true', contacto: texto(a.contacto) || null, tipoPropuesto: texto(a.tipo),
    };
    if (datos.descripcion.length < 8) return error('Falta describir qué está pasando: pregúntaselo al ciudadano.');
    if (datos.direccion.length < 3) return error('Falta la dirección o un punto de referencia en Bogotá: pregúntaselo al ciudadano.');
    if (!this.clasificacion.esTipo(datos.tipoPropuesto)) return error(`Tipo '${a.tipo}' desconocido.`);

    const an = this.ciudadanos.analizar(datos, this.contexto.textoCiudadano ?? '', { verificarEnCurso: true });
    const nombre = this.conocimiento.reportesCiudadanos.tipos[an.decision.tipo].nombre;
    const pregunta = [
      '¿Registro este reporte ambiental?',
      `${nombre} · prioridad ${an.prioridad.prioridad}${an.prioridad.emergencia ? ' · EMERGENCIA: llama ya al 123' : ''}`,
      `Dónde: ${datos.direccion}${an.localidad ? ` (${an.localidad})` : ''}`,
      `Qué pasa: ${datos.descripcion}`,
      this.contexto.evidencias.length ? `Evidencias adjuntas: ${this.contexto.evidencias.length}` : '',
    ].filter(Boolean).join('\n');
    if (!(await this.confirmaciones.preguntar(pregunta))) return { registrado: false, motivo: 'El ciudadano no confirmó el registro del reporte.' };

    const r = await this.ciudadanos.crear(datos, { canal: this.contexto.canal, autor: 'agente', evidenciaIds: this.contexto.evidencias, textoCiudadano: this.contexto.textoCiudadano });
    this.contexto.evidencias = [];
    return { registrado: true, ...r };
  }

  private async consultarNorma(pregunta: unknown): Promise<ResultadoHerramienta> {
    const r = await this.norma.preguntar(String(pregunta ?? '').trim());
    return {
      respuesta: r.respuesta, origen: r.origen,
      citas: r.citas.map((c) => ({ clave: c.clave, titulo: c.titulo, texto: c.texto, fuente: c.fuente, verificado: c.verificado })),
    };
  }
}

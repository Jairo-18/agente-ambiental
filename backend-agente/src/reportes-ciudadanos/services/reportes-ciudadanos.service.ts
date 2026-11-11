import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { ConocimientoService } from '../../conocimiento/services/conocimiento.service';
import { OllamaService } from '../../llm/services/ollama.service';
import { ChatAdjunto } from '../../shared/entities/chatAdjunto.entity';
import { ESTADOS_REPORTE, EstadoReporte, ReporteCiudadano } from '../../shared/entities/reporteCiudadano.entity';
import { ReporteCiudadanoEvento } from '../../shared/entities/reporteCiudadanoEvento.entity';
import { ReporteEvidencia } from '../../shared/entities/reporteEvidencia.entity';
import { FiltrosReportes, ReporteCiudadanoRepository, ReporteParecido } from '../../shared/repositories/reporteCiudadano.repository';
import { ClasificacionService, Decision, Enrutamiento, ResultadoPrioridad } from './clasificacion.service';

export interface DatosReporte {
  descripcion: string;
  direccion: string;
  localidad?: string | null;
  barrio?: string | null;
  cuando?: string | null;
  enCurso: boolean;
  contacto?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  /** Lo que propuso el modelo (o el formulario). */
  tipoPropuesto?: string | null;
}

export interface Analisis {
  decision: Decision;
  /** "En curso" ya verificado (ver analizar). */
  enCurso: boolean;
  prioridad: ResultadoPrioridad;
  enrutamiento: Enrutamiento;
  localidad: string | null;
}

/**
 * Duplicados: mismo tipo, misma localidad (SQL) y descripción parecida (coseno ≥ 0,72) en los últimos 30 días.
 * Medido con EmbeddingGemma (2026-11-10): el mismo hecho contado distinto dio 0,73-0,89; hechos distintos del mismo tipo
 * llegaron a 0,73. Por eso el vector solo no basta y se combina con tipo y localidad.
 */
const DUPLICADOS = { dias: 30, minimo: 0.72, limite: 3 };

const vista = (r: ReporteCiudadano, nombreTipo: string, comoReportar: string[], parecidos?: ReporteParecido[]) => ({
  radicado: r.radicado, tipo: r.tipo, tipo_nombre: nombreTipo, descripcion: r.descripcion, direccion: r.direccion,
  localidad: r.localidad, barrio: r.barrio, cuando: r.cuando, en_curso: r.enCurso, prioridad: r.prioridad, puntaje: r.puntaje,
  motivos_prioridad: r.motivosPrioridad, emergencia: r.emergencia, entidad: r.entidad, canales_oficiales: r.canalesOficiales,
  como_reportar: comoReportar, estado: r.estado, canal: r.canal, contacto: r.contacto ? 'registrado' : null, creado_en: r.creadoEn, actualizado_en: r.actualizadoEn,
  clasificacion: { tipo_modelo: r.tipoModelo, tipo_reglas: r.tipoReglas },
  ...(r.eventos ? { historial: r.eventos.map((e) => ({ estado: e.estado, nota: e.nota, autor: e.autor, fecha: e.creadoEn })) } : {}),
  ...(r.evidencias ? { evidencias: r.evidencias.map((e) => ({ id: e.adjunto.chatAdjuntoId, tipo: e.adjunto.tipo, nombre: e.adjunto.nombre, texto: e.adjunto.texto })) } : {}),
  ...(parecidos ? { posibles_duplicados: parecidos.map((p) => ({ radicado: p.radicado, tipo: p.tipo, direccion: p.direccion, estado: p.estado, similitud: Math.round(p.similitud * 100) / 100 })) } : {}),
});
export type VistaReporte = ReturnType<typeof vista>;

/**
 * Reportes ciudadanos ambientales de Bogotá: análisis por reglas, radicado, evidencias, historial de estados y
 * detección de duplicados por similitud semántica (pgvector) dentro de la misma localidad.
 */
@Injectable()
export class ReportesCiudadanosService {
  private readonly logger = new Logger(ReportesCiudadanosService.name);

  constructor(
    private readonly repo: ReporteCiudadanoRepository,
    private readonly clasificacion: ClasificacionService,
    private readonly conocimiento: ConocimientoService,
    private readonly ollama: OllamaService,
  ) {}

  private nombreTipo(tipo: string): string {
    return (this.conocimiento.reportesCiudadanos.tipos as Record<string, { nombre: string }>)[tipo]?.nombre ?? tipo;
  }

  private comoReportar(tipo: string): string[] {
    return this.clasificacion.esTipo(tipo) ? this.clasificacion.enrutar(tipo).canales.map((c) => c.corto) : [];
  }

  private async evidencias(ids: string[]): Promise<ChatAdjunto[]> {
    if (!ids.length) return [];
    const encontradas = await this.repo.manager.find(ChatAdjunto, { where: { chatAdjuntoId: In(ids) } });
    if (encontradas.length !== ids.length) throw new BadRequestException('Alguna evidencia no existe.');
    return encontradas;
  }

  /** Lo que se haría con el reporte, sin guardarlo (para pedir confirmación antes). */
  analizar(d: DatosReporte, textoEvidencias = '', opciones: { verificarEnCurso?: boolean } = {}): Analisis {
    const texto = [d.descripcion, d.cuando, textoEvidencias].filter(Boolean).join('. ');
    const decision = this.clasificacion.decidirTipo(texto, d.tipoPropuesto);
    // la prioridad mira también la dirección: el modelo suele poner ahí "frente al colegio" o "al lado del hospital"
    const textoPrioridad = [texto, d.direccion].filter(Boolean).join('. ');
    // por el agente, "en curso" (lo que dijo el modelo) solo cuenta si el texto lo dice; en el formulario lo marca la persona
    const enCurso = !!d.enCurso && (!opciones.verificarEnCurso || this.clasificacion.pasaAhora(textoPrioridad));
    return {
      decision,
      enCurso,
      prioridad: this.clasificacion.prioridad(decision.tipo, textoPrioridad, enCurso),
      enrutamiento: this.clasificacion.enrutar(decision.tipo),
      localidad: this.clasificacion.localidad(d.localidad, d.direccion, d.barrio),
    };
  }

  async crear(
    d: DatosReporte,
    opciones: { canal: ReporteCiudadano['canal']; autor: ReporteCiudadanoEvento['autor']; evidenciaIds?: string[]; textoCiudadano?: string },
  ): Promise<VistaReporte> {
    const descripcion = d.descripcion?.trim();
    const direccion = d.direccion?.trim();
    if (!descripcion || descripcion.length < 8) throw new BadRequestException('Falta describir qué está pasando.');
    if (!direccion || direccion.length < 3) throw new BadRequestException('Falta la dirección o un punto de referencia en Bogotá.');
    const evidencias = await this.evidencias([...new Set(opciones.evidenciaIds ?? [])]);
    const extra = [opciones.textoCiudadano, ...evidencias.map((e) => e.texto)].filter(Boolean).join('. ');
    const a = this.analizar(d, extra, { verificarEnCurso: opciones.autor === 'agente' });

    let embedding: number[] | null = null;
    let parecidos: ReporteParecido[] = [];
    try {
      [embedding] = await this.ollama.embeddings([`${this.nombreTipo(a.decision.tipo)}. ${descripcion}. ${direccion}`], 'documento');
      parecidos = await this.repo.parecidos(embedding, { tipo: a.decision.tipo, localidad: a.localidad, ...DUPLICADOS });
    } catch (e) {
      this.logger.warn(`Reporte sin vector (no se buscan duplicados): ${(e as Error).message}`);
    }

    const r = await this.repo.crearConRadicado(
      {
        tipo: a.decision.tipo, tipoModelo: a.decision.tipoModelo, tipoReglas: a.decision.tipoReglas, descripcion, direccion,
        localidad: a.localidad, barrio: d.barrio?.trim() || null, cuando: d.cuando?.trim() || null, enCurso: a.enCurso,
        latitud: d.latitud ?? null, longitud: d.longitud ?? null, prioridad: a.prioridad.prioridad, puntaje: a.prioridad.puntaje,
        motivosPrioridad: [...a.prioridad.motivos, `tipo: ${a.decision.decision}`], emergencia: a.prioridad.emergencia,
        entidad: a.enrutamiento.entidad, canalesOficiales: a.enrutamiento.canales.map((c) => `${c.nombre}: ${c.detalle}`),
        canal: opciones.canal, contacto: d.contacto?.trim() || null, embedding,
      },
      opciones.autor,
    );
    if (evidencias.length) await this.repo.manager.save(ReporteEvidencia, evidencias.map((adjunto) => ({ reporte: { reporteCiudadanoId: r.reporteCiudadanoId }, adjunto })));
    return vista(r, this.nombreTipo(r.tipo), this.comoReportar(r.tipo), parecidos);
  }

  async consultar(radicado: string): Promise<VistaReporte> {
    const r = await this.repo.conDetalle(radicado.trim().toUpperCase());
    if (!r) throw new NotFoundException(`No hay ningún reporte con el radicado ${radicado}.`);
    return vista(r, this.nombreTipo(r.tipo), this.comoReportar(r.tipo));
  }

  async listar(f: FiltrosReportes) {
    return (await this.repo.listar(f)).map((r) => vista(r, this.nombreTipo(r.tipo), this.comoReportar(r.tipo)));
  }

  estadisticas() {
    return this.repo.estadisticas();
  }

  /** Vuelve a calcular el vector de cada reporte (al cambiar de modelo de embeddings). */
  async reindexar(): Promise<number> {
    const todos = await this.repo.find();
    for (const r of todos) {
      const [v] = await this.ollama.embeddings([`${this.nombreTipo(r.tipo)}. ${r.descripcion}. ${r.direccion}`], 'documento');
      await this.repo.update(r.reporteCiudadanoId, { embedding: v });
    }
    return todos.length;
  }

  /** Un funcionario mueve el reporte de estado (queda en el historial con su nota). */
  async cambiarEstado(radicado: string, estado: EstadoReporte, nota: string | undefined, autor: ReporteCiudadanoEvento['autor'] = 'funcionario') {
    if (!(ESTADOS_REPORTE as readonly string[]).includes(estado)) throw new BadRequestException(`Estado inválido. Opciones: ${ESTADOS_REPORTE.join(', ')}.`);
    const r = await this.repo.findOneBy({ radicado: radicado.trim().toUpperCase() });
    if (!r) throw new NotFoundException(`No hay ningún reporte con el radicado ${radicado}.`);
    await this.repo.manager.transaction(async (m) => {
      await m.update(ReporteCiudadano, r.reporteCiudadanoId, { estado });
      await m.save(ReporteCiudadanoEvento, m.create(ReporteCiudadanoEvento, { reporte: r, estado, nota: nota?.trim() || null, autor }));
    });
    return this.consultar(r.radicado!);
  }
}

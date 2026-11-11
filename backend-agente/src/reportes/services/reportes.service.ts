import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Disponible, excedencias, niveles, noEvaluables } from '../../analisis/hechos.util';
import { HechosService } from '../../analisis/services/hechos.service';
import { DatosService } from '../../datos/services/datos.service';
import { OllamaService } from '../../llm/services/ollama.service';
import { ClienteLlm, RedaccionService } from '../../redaccion/services/redaccion.service';
import { PlantillasService } from '../../redaccion/services/plantillas.service';
import { PERIODO_REGEX } from '../../shared/constants/aire.constants';
import { Reporte } from '../../shared/entities/reporte.entity';
import { ReporteRepository } from '../../shared/repositories/reporte.repository';
import { mesTexto } from '../../shared/utils/fechas.util';
import { OpcionesGeneracion, Revision, ResultadoGeneracion, VersionReporte } from '../interfaces/reportes.interface';
import { AlmacenReportesService } from './almacen-reportes.service';
import { DetalleReporteService } from './detalle-reporte.service';
import { GraficosService } from './graficos.service';
import { ReporteDocxService } from './reporte-docx.service';
import { TrazabilidadService } from './trazabilidad.service';

/**
 * Orquesta el reporte mensual: datos -> QA/QC y hechos -> gráficos -> redacción -> Word -> disco -> base de datos.
 * Todo lo que el reporte afirma lo calcula el código; el modelo (si se pide) solo describe concentraciones.
 */
@Injectable()
export class ReportesService {
  private readonly log = new Logger('Reportes');

  constructor(
    private readonly datos: DatosService,
    private readonly hechos: HechosService,
    private readonly graficos: GraficosService,
    private readonly redaccion: RedaccionService,
    private readonly plantillas: PlantillasService,
    private readonly docx: ReporteDocxService,
    private readonly trazabilidad: TrazabilidadService,
    private readonly almacen: AlmacenReportesService,
    private readonly detalle: DetalleReporteService,
    private readonly ollama: OllamaService,
    private readonly repo: ReporteRepository,
  ) {}

  validarPeriodo(periodo: string): void {
    if (!PERIODO_REGEX.test(periodo ?? '')) throw new BadRequestException('El periodo debe tener el formato AAAA-MM, por ejemplo 2026-10.');
  }

  /** Carga el archivo y comprueba que traiga datos del mes pedido (si no, saldría un reporte vacío). */
  private async cargarDelPeriodo(archivo: string, periodo: string) {
    this.validarPeriodo(periodo);
    const filas = await this.datos.cargar(archivo);
    const sinDatos = this.datos.sinDatosDelPeriodo(filas, periodo);
    if (sinDatos) throw new BadRequestException(sinDatos);
    return filas;
  }

  /** QA/QC y representatividad de un archivo para un mes. No genera ni escribe nada. */
  async revisar(archivo: string, periodo: string): Promise<Revision> {
    const filas = await this.cargarDelPeriodo(archivo, periodo);
    const { hechos } = this.hechos.analizar(filas, periodo);
    const relevantes = hechos.advertencias.filter((a) => a.severidad !== 'info');
    const conteo = (s: string) => hechos.advertencias.filter((a) => a.severidad === s).length;
    const representatividad: Revision['representatividad_pct'] = {};
    for (const [est, e] of Object.entries(hechos.estaciones)) {
      representatividad[est] = Object.fromEntries(
        Object.entries(e.contaminantes).filter(([, x]) => x.disponible).map(([c, x]) => [c, (x as Disponible).representatividad_pct]),
      );
    }
    return {
      periodo,
      estaciones: Object.keys(hechos.estaciones),
      horas_esperadas: hechos.meta.n_esperados,
      n_advertencias_por_severidad: { error: conteo('error'), aviso: conteo('aviso'), info: conteo('info') },
      advertencias: relevantes.slice(0, 12).map((a) => `[${a.severidad}] ${a.mensaje}`),
      advertencias_omitidas: Math.max(0, relevantes.length - 12),
      representatividad_pct: representatividad,
      series_no_evaluables: noEvaluables(hechos),
      minimo_para_evaluar_pct: hechos.meta.representatividad_minima_pct,
    };
  }

  existe(periodo: string): boolean {
    return this.almacen.existe(periodo);
  }

  /** Genera el reporte, lo escribe en disco y guarda el resultado en la base. Quien llama ya confirmó si había uno. */
  async generar({ archivo, periodo, conLlm, descarga }: OpcionesGeneracion): Promise<ResultadoGeneracion> {
    const filas = await this.cargarDelPeriodo(archivo, periodo);
    const { hechos, datos } = this.hechos.analizar(filas, periodo);

    const figuras = {
      pm10: this.graficos.graficoDiario(datos, hechos, 'PM10', periodo),
      pm25: this.graficos.graficoDiario(datos, hechos, 'PM2.5', periodo),
      gases: this.graficos.graficoGases(hechos),
    };
    const llm: ClienteLlm | null = conLlm ? (s, u) => this.ollama.chatSimple(s, u) : null;
    const textos = await this.redaccion.redactarTodas(hechos, llm);

    const buffer = await this.docx.construir({ hechos, textos, figuras, fechaGeneracion: new Date().toISOString().slice(0, 10), descarga });
    this.almacen.guardar(periodo, {
      'reporte.docx': buffer,
      'hechos.json': JSON.stringify(hechos, null, 2),
      'trazabilidad.md': this.trazabilidad.generar(hechos, textos),
      ...(figuras.pm10 ? { 'pm10_diario.png': figuras.pm10.png } : {}),
      ...(figuras.pm25 ? { 'pm25_diario.png': figuras.pm25.png } : {}),
      ...(figuras.gases ? { 'gases_medias.png': figuras.gases.png } : {}),
    });

    const redaccion = Object.fromEntries(Object.entries(textos).map(([s, t]) => [s, t.origen]));
    const guardado = await this.repo.guardarCompleto({
      detalle: this.detalle.construir(hechos, this.almacen.archivosDe(periodo)),
      archivoDatos: archivo, conLlm, carpeta: this.almacen.nombreCarpeta(periodo), redaccion, origen: 'generado',
    });
    this.log.log(`Reporte de ${mesTexto(periodo)} generado (versión ${guardado.reporteId}; comentarios: ${JSON.stringify(redaccion)})`);

    return {
      generado: true, periodo, carpeta: this.almacen.nombreCarpeta(periodo), archivo: 'reporte.docx',
      estaciones: Object.keys(hechos.estaciones),
      excedencias: excedencias(hechos).map(({ regla_id, ...e }) => e),
      niveles_excepcionales: niveles(hechos).map(({ regla_id, ...n }) => n),
      series_no_evaluables: noEvaluables(hechos),
      redaccion,
      texto_usuario: this.plantillas.texto('resumen', hechos),
      reporteId: guardado.reporteId,
    };
  }

  /** Reportes que hay en disco y la base no (p. ej. generados antes de existir la base): se importan. */
  async sincronizar(): Promise<string[]> {
    const guardados = new Set(await this.repo.periodosGuardados());
    const importados: string[] = [];
    for (const periodo of this.almacen.periodos()) {
      if (guardados.has(periodo)) continue;
      const hechos = this.almacen.leerHechos(periodo);
      if (!hechos) continue;
      await this.repo.guardarCompleto({
        detalle: this.detalle.construir(hechos, this.almacen.archivosDe(periodo)),
        archivoDatos: 'desconocido (reporte importado del disco)', conLlm: null, carpeta: this.almacen.nombreCarpeta(periodo),
        redaccion: {}, origen: 'importado', generadoEn: this.almacen.fechaDe(periodo),
      });
      importados.push(periodo);
    }
    if (importados.length) this.log.log(`Importados del disco: ${importados.join(', ')}`);
    return importados;
  }

  /** Hechos ya calculados de una estación y un contaminante de un reporte generado (lo lee del disco). */
  consultar(periodo: string, estacion: string, contaminante: string): Record<string, unknown> {
    this.validarPeriodo(periodo);
    const h = this.almacen.leerHechos(periodo);
    if (!h) throw new NotFoundException(`No hay reporte generado para ${periodo}. Genéralo primero.`);
    if (!(estacion in h.estaciones)) throw new NotFoundException(`Estación '${estacion}' no está en el reporte. Hay: ${Object.keys(h.estaciones).join(', ')}.`);
    const x = h.estaciones[estacion].contaminantes[contaminante];
    if (!x) throw new NotFoundException(`Contaminante '${contaminante}' no está en el reporte.`);
    return { estacion, contaminante, ...x };
  }

  // ---------------------------------------------------------------- lecturas de la base

  listar() {
    return this.repo.listarVigentes();
  }

  analitica() {
    return this.repo.analitica();
  }

  /** Último reporte guardado de un periodo, con los nombres de campo que consume el frontend. */
  async ultimo(periodo: string) {
    this.validarPeriodo(periodo);
    const r = await this.repo.ultimoDe(periodo);
    if (!r) throw new NotFoundException(`No hay reporte de ${periodo}.`);
    return this.aVista(r);
  }

  async versiones(periodo: string): Promise<VersionReporte[]> {
    this.validarPeriodo(periodo);
    return (await this.repo.versionesDe(periodo)).map((v) => ({
      id: v.reporteId, generado_en: v.generadoEn, archivo_datos: v.archivoDatos, con_llm: v.conLlm, origen: v.origen, n_excedencias: v.nExcedencias,
    }));
  }

  private aVista(r: Reporte) {
    return {
      id: r.reporteId, periodo: r.periodo, generado_en: r.generadoEn, archivo_datos: r.archivoDatos, con_llm: r.conLlm,
      origen: r.origen, redaccion: r.redaccion, detalle: r.detalle,
    };
  }

  /** Un archivo del reporte (DOCX, trazabilidad, gráficos): ruta validada contra la lista cerrada. */
  rutaDeArchivo(periodo: string, nombre: string): string {
    this.validarPeriodo(periodo);
    const ruta = this.almacen.rutaDe(periodo, nombre);
    if (!ruta) throw new NotFoundException('No existe ese archivo.');
    return ruta;
  }

  tipoDe(nombre: string): string {
    return this.almacen.tipoDe(nombre);
  }
}

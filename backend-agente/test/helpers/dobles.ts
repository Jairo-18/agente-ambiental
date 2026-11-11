import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DetalleReporteService } from '../../src/reportes/services/detalle-reporte.service';
import { AlmacenReportesService } from '../../src/reportes/services/almacen-reportes.service';
import { GraficosService } from '../../src/reportes/services/graficos.service';
import { ReporteDocxService } from '../../src/reportes/services/reporte-docx.service';
import { ReportesService } from '../../src/reportes/services/reportes.service';
import { TrazabilidadService } from '../../src/reportes/services/trazabilidad.service';
import { PlantillasService } from '../../src/redaccion/services/plantillas.service';
import { RedaccionService } from '../../src/redaccion/services/redaccion.service';
import { MensajeOllama } from '../../src/llm/services/ollama.service';
import { NuevoReporte } from '../../src/shared/repositories/reporte.repository';
import { crearAnalisis, crearConfig, crearDatos } from './servicios';
import { ConocimientoService } from '../../src/conocimiento/services/conocimiento.service';
import { ClasificacionService } from '../../src/reportes-ciudadanos/services/clasificacion.service';
import { ReportesCiudadanosService } from '../../src/reportes-ciudadanos/services/reportes-ciudadanos.service';
import { ReporteCiudadano } from '../../src/shared/entities/reporteCiudadano.entity';
import { radicadoDe } from '../../src/shared/repositories/reporteCiudadano.repository';

/** El repositorio de reportes ciudadanos en memoria (radicados consecutivos, sin duplicados ni vectores). */
export class RepoCiudadanoFalso {
  guardados: ReporteCiudadano[] = [];

  async crearConRadicado(datos: Partial<ReporteCiudadano>) {
    const id = this.guardados.length + 1;
    const ahora = new Date('2026-11-10T15:00:00Z');
    const r = { ...datos, reporteCiudadanoId: id, estado: 'recibido', creadoEn: ahora, actualizadoEn: ahora, radicado: radicadoDe(id, ahora) } as ReporteCiudadano;
    this.guardados.push(r);
    return r;
  }

  async parecidos() {
    return [];
  }

  async conDetalle(radicado: string) {
    const r = this.guardados.find((g) => g.radicado === radicado);
    return r ? { ...r, eventos: [{ estado: 'recibido', nota: 'Reporte recibido y clasificado.', autor: 'agente', creadoEn: r.creadoEn }], evidencias: [] } : null;
  }
}

/** Reportes ciudadanos reales (reglas del YAML) sobre el repositorio en memoria. */
export function crearCiudadanos(ollama: unknown = { embeddings: async () => { throw new Error('sin Ollama'); } }) {
  const conocimiento = new ConocimientoService(crearConfig());
  const clasificacion = new ClasificacionService(conocimiento);
  const repo = new RepoCiudadanoFalso();
  return { servicio: new ReportesCiudadanosService(repo as never, clasificacion, conocimiento, ollama as never), repo, clasificacion, conocimiento };
}

export const carpetaTemporal = (prefijo = 'agente-') => mkdtempSync(join(tmpdir(), prefijo));

/** El repositorio de reportes en memoria: lo justo para probar el orquestador sin base de datos. */
export class RepoReporteFalso {
  guardados: (NuevoReporte & { reporteId: number })[] = [];

  async guardarCompleto(n: NuevoReporte) {
    const g = { ...n, reporteId: this.guardados.length + 1 };
    this.guardados.push(g);
    return g;
  }

  async periodosGuardados() {
    return [...new Set(this.guardados.map((g) => g.detalle.periodo))];
  }
}

/** Un "Ollama" guionado: devuelve respuestas fijas en orden y recuerda lo que recibió. */
export class OllamaFalso {
  respuestas: (MensajeOllama | string | Error)[] = [];
  vistos: MensajeOllama[][] = [];
  chatSimpleLlamadas: { sistema: string; usuario: string }[] = [];

  encolar(...r: (MensajeOllama | string | Error)[]) {
    this.respuestas.push(...r);
    return this;
  }

  private siguiente(): MensajeOllama | string {
    const r = this.respuestas.shift();
    if (r instanceof Error) throw r;
    return r ?? '';
  }

  async chatSimple(sistema: string, usuario: string): Promise<string> {
    this.chatSimpleLlamadas.push({ sistema, usuario });
    const r = this.siguiente();
    return typeof r === 'string' ? r : r.content;
  }

  async chat(mensajes: MensajeOllama[]): Promise<string> {
    this.vistos.push(mensajes.map((m) => ({ ...m })));
    const r = this.siguiente();
    return typeof r === 'string' ? r : r.content;
  }

  async chatConHerramientas(mensajes: MensajeOllama[]): Promise<MensajeOllama> {
    this.vistos.push(mensajes.map((m) => ({ ...m })));
    const r = this.siguiente();
    return typeof r === 'string' ? { role: 'assistant', content: r } : r;
  }

  /** Embeddings deterministas: bolsa de palabras hasheadas y normalizada (textos parecidos -> vectores cercanos). */
  async embeddings(textos: string[]): Promise<number[][]> {
    return textos.map((t) => vectorDe(t)); // (no `map(vectorDe)`: el índice se colaría como dimensión)
  }

  async disponible() {
    return { activo: true, modelos: ['qwen2.5:14b', 'nomic-embed-text:latest'] };
  }
}

export const llamada = (nombre: string, args: Record<string, unknown> = {}): MensajeOllama => ({
  role: 'assistant', content: '', tool_calls: [{ function: { name: nombre, arguments: args } }],
});

export function vectorDe(texto: string, dim = 768): number[] {
  const v = new Array(dim).fill(0);
  for (const palabra of texto.toLowerCase().match(/[a-záéíóúñ0-9]+/g) ?? []) {
    let h = 0;
    for (const c of palabra) h = (h * 31 + c.charCodeAt(0)) % dim;
    v[h] += 1;
  }
  const norma = Math.hypot(...v) || 1;
  return v.map((x) => x / norma);
}

/** El orquestador de reportes con todo real salvo la base de datos, Ollama y la carpeta de salida (temporal). */
export function crearReportes(ollama = new OllamaFalso(), reportsDir = carpetaTemporal('reportes-')) {
  const a = crearAnalisis();
  const config = crearConfig({ reportsDir });
  const plantillas = new PlantillasService();
  const almacen = new AlmacenReportesService(config);
  const repo = new RepoReporteFalso();
  const servicio = new ReportesService(
    crearDatos(), a.hechos, new GraficosService(a.conocimiento, a.estadistica), new RedaccionService(plantillas), plantillas,
    new ReporteDocxService(a.conocimiento), new TrazabilidadService(a.conocimiento), almacen, new DetalleReporteService(plantillas),
    ollama as never, repo as never,
  );
  return { servicio, almacen, repo, ollama, reportsDir, plantillas, ...a };
}

// ---------------------------------------------------------------- el agente completo, con dobles en los bordes

import { AgenteService } from '../../src/asistente/services/agente.service';
import { ConfirmacionesService } from '../../src/asistente/services/confirmaciones.service';
import { HerramientasService } from '../../src/asistente/services/herramientas.service';
import { EvaluacionesService } from '../../src/evaluaciones/services/evaluaciones.service';

export class RepoEvaluacionFalso {
  guardadas: unknown[] = [];
  create(x: unknown) { return x; }
  async save(x: unknown) { this.guardadas.push(x); return x; }
  async ultimas() { return []; }
}

/** La norma "buscada" de mentira: devuelve siempre el fragmento del límite de PM10. */
export const normaFalsa = {
  preguntar: async (pregunta: string) => ({
    pregunta, origen: 'llm', intentos: 1, problemas: [],
    respuesta: 'El límite de PM10 en 24 horas es 75 µg/m³ [LIM-PM10-24H].',
    citas: [{ clave: 'LIM-PM10-24H', titulo: 'Límite PM10', texto: 'El nivel máximo permisible de PM10 es 75 µg/m³.', fuente: 'Res. 2254/2017', verificado: true, similitud: 0.8 }],
  }),
};

/** Agente + herramientas reales (sobre datos, reglas y reportes reales en una carpeta temporal); falsos: Ollama y la base. */
export function crearAgente() {
  const ollama = new OllamaFalso();
  const r = crearReportes(ollama);
  const evaluaciones = new EvaluacionesService(r.reglas, new RepoEvaluacionFalso() as never);
  const confirmaciones = new ConfirmacionesService();
  const c = crearCiudadanos();
  const herramientas = new HerramientasService(crearDatos(), r.servicio, evaluaciones, normaFalsa as never, confirmaciones, c.servicio, c.clasificacion, c.conocimiento);
  const agente = new AgenteService(ollama as never, herramientas);
  return { agente, herramientas, confirmaciones, ollama, reportes: r, ciudadanos: c.repo };
}

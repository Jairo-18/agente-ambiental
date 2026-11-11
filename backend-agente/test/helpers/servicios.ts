import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { EstadisticaService } from '../../src/analisis/services/estadistica.service';
import { HechosService } from '../../src/analisis/services/hechos.service';
import { QaqcService } from '../../src/analisis/services/qaqc.service';
import { AppConfig, configuration } from '../../src/config/configuration';
import { ConocimientoService } from '../../src/conocimiento/services/conocimiento.service';
import { FragmentosService } from '../../src/conocimiento/services/fragmentos.service';
import { FilaLarga } from '../../src/datos/interfaces/fila.interface';
import { DatosService } from '../../src/datos/services/datos.service';
import { RmcabXlsxService } from '../../src/datos/services/rmcab-xlsx.service';
import { MotorReglasService } from '../../src/normativa/services/motor-reglas.service';
import { UnidadesService } from '../../src/normativa/services/unidades.service';
import { fmtFechaHora } from '../../src/shared/utils/fechas.util';

export const RAIZ = join(__dirname, '..', '..');
export const KNOWLEDGE_DIR = join(RAIZ, 'knowledge');
export const DATA_DIR = join(RAIZ, 'data');
export const CSV_OCTUBRE = 'rmcab_2026-10_largo.csv';
export const XLSX_OCTUBRE = 'rmcab_2026-10_horario_guaymaral-kennedy-puentearanda.xlsx';
export const GOLDEN_HECHOS = join(RAIZ, 'test', 'fixtures', 'golden-hechos-2026-10.json');

/** ConfigService de mentira, con las carpetas de este repositorio (y las que se quieran sobreescribir). */
export function crearConfig(storage: Partial<AppConfig['storage']> = {}): ConfigService<AppConfig, true> {
  const cfg: AppConfig = {
    ...configuration(),
    storage: { knowledgeDir: KNOWLEDGE_DIR, dataDir: DATA_DIR, reportsDir: join(RAIZ, 'storage', 'reports'), ...storage },
  };
  return { get: (clave: keyof AppConfig) => cfg[clave] } as unknown as ConfigService<AppConfig, true>;
}

/** Los servicios puros de la norma, cableados a mano con la base de conocimiento real. */
export function crearNorma() {
  const conocimiento = new ConocimientoService(crearConfig());
  const unidades = new UnidadesService(conocimiento);
  const reglas = new MotorReglasService(conocimiento, unidades);
  const fragmentos = new FragmentosService(conocimiento);
  return { conocimiento, unidades, reglas, fragmentos };
}

/** Más el análisis de datos: QA/QC, estadística y hechos. */
export function crearAnalisis() {
  const n = crearNorma();
  const qaqc = new QaqcService(n.conocimiento, n.unidades);
  const estadistica = new EstadisticaService(n.conocimiento, n.unidades);
  const hechos = new HechosService(n.conocimiento, n.reglas, qaqc, estadistica);
  return { ...n, qaqc, estadistica, hechos };
}

export function crearDatos(dataDir = DATA_DIR) {
  return new DatosService(crearConfig({ dataDir }), new RmcabXlsxService());
}

/** Octubre de 2026 (RMCAB), cargado una sola vez por proceso de prueba. */
let octubre: Promise<FilaLarga[]> | undefined;
export const cargarOctubre = (): Promise<FilaLarga[]> => (octubre ??= crearDatos().cargar(CSV_OCTUBRE));

/** Generador pseudoaleatorio con semilla (mulberry32): las pruebas con "ruido" son reproducibles. */
export function aleatorio(semilla = 0): () => number {
  let a = semilla + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Una serie sintética de un mes completo (744 horas). `valores` = una constante o un arreglo; sin él, ruido N(30, 3). */
export function serieSintetica(
  horas: number[],
  { estacion = 'Kennedy', variable = 'PM10', unidad = 'µg/m3', valores }: { estacion?: string; variable?: string; unidad?: string | null; valores?: number | number[] | null } = {},
): FilaLarga[] {
  const rnd = aleatorio(0);
  const normal = () => 30 + 3 * Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
  return horas.map((t, i) => ({
    estacion, variable, unidad,
    fecha_hora: fmtFechaHora(t),
    valor: valores === undefined ? normal() : Array.isArray(valores) ? valores[i] : valores,
  }));
}

/** Compara dos estructuras JSON permitiendo una pequeña diferencia numérica (redondeos a 2 decimales). */
export function diferencias(actual: unknown, esperado: unknown, tol = 0.0101, ruta = '$'): string[] {
  if (typeof esperado === 'number' && typeof actual === 'number') {
    return Math.abs(actual - esperado) <= tol ? [] : [`${ruta}: ${actual} != ${esperado}`];
  }
  if (esperado === null || actual === null || typeof esperado !== 'object' || typeof actual !== 'object') {
    return actual === esperado ? [] : [`${ruta}: ${JSON.stringify(actual)} != ${JSON.stringify(esperado)}`];
  }
  if (Array.isArray(esperado) !== Array.isArray(actual)) return [`${ruta}: tipo distinto`];
  const claves = new Set([...Object.keys(esperado as object), ...Object.keys(actual as object)]);
  return [...claves].flatMap((k) => {
    if (!(k in (esperado as object))) return [`${ruta}.${k}: sobra`];
    if (!(k in (actual as object))) return [`${ruta}.${k}: falta`];
    return diferencias((actual as any)[k], (esperado as any)[k], tol, `${ruta}.${k}`);
  });
}

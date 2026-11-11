import { Rankings } from '../verificacion/verificador';
import { ContaminanteHechos, ExcedenciaHechos, Hechos, NivelHechos } from './interfaces/analisis.interface';

/** Consultas puras sobre `hechos.json`: nada se calcula de nuevo, solo se recorre lo que ya calculó el análisis. */

export type Disponible = Extract<ContaminanteHechos, { disponible: true }>;

export function* recorrer(hechos: Hechos, contaminantes?: readonly string[] | null): Generator<[string, string, ContaminanteHechos]> {
  for (const [est, e] of Object.entries(hechos.estaciones)) {
    for (const [c, x] of Object.entries(e.contaminantes)) {
      if (!contaminantes || contaminantes.includes(c)) yield [est, c, x];
    }
  }
}

export interface ExcedenciaEnEstacion extends ExcedenciaHechos {
  estacion: string;
  contaminante: string;
  promedio: string;
}
export interface NivelEnEstacion extends NivelHechos {
  estacion: string;
  contaminante: string;
  promedio: string;
}

export function excedencias(hechos: Hechos, contaminantes?: readonly string[] | null): ExcedenciaEnEstacion[] {
  const out: ExcedenciaEnEstacion[] = [];
  for (const [estacion, contaminante, x] of recorrer(hechos, contaminantes)) {
    if (!x.disponible) continue;
    for (const [promedio, p] of Object.entries(x.promedios)) for (const e of p.excedencias) out.push({ estacion, contaminante, promedio, ...e });
  }
  return out;
}

export function niveles(hechos: Hechos, contaminantes?: readonly string[] | null): NivelEnEstacion[] {
  const out: NivelEnEstacion[] = [];
  for (const [estacion, contaminante, x] of recorrer(hechos, contaminantes)) {
    if (!x.disponible) continue;
    for (const [promedio, p] of Object.entries(x.promedios)) for (const n of p.niveles_excepcionales) out.push({ estacion, contaminante, promedio, ...n });
  }
  return out;
}

export function noEvaluables(hechos: Hechos, contaminantes?: readonly string[] | null) {
  const out: { estacion: string; contaminante: string; representatividad_pct: number | null }[] = [];
  for (const [estacion, contaminante, x] of recorrer(hechos, contaminantes)) {
    if (x.disponible && !x.evaluable) out.push({ estacion, contaminante, representatividad_pct: x.representatividad_pct });
  }
  return out;
}

export interface RankingContaminante {
  alto: Set<string>;
  bajo: Set<string>;
  metricas: Record<string, Record<string, number>>;
}

/**
 * Por contaminante, las estaciones con el valor más alto y más bajo (media mensual o máximo de cada promedio).
 * Solo cuentan series evaluables; con menos de dos no hay comparación posible y los conjuntos quedan vacíos.
 */
export function rankings(hechos: Hechos, contaminantes?: readonly string[] | null): Record<string, RankingContaminante> {
  const out: Record<string, RankingContaminante> = {};
  for (const c of contaminantes ?? hechos.meta.contaminantes) {
    const metricas: Record<string, Record<string, number>> = {};
    for (const [est, e] of Object.entries(hechos.estaciones)) {
      const x = e.contaminantes[c];
      if (!x?.disponible || !x.evaluable) continue;
      if (x.media_mensual_ugm3 !== null) (metricas.media ??= {})[est] = x.media_mensual_ugm3;
      for (const [t, p] of Object.entries(x.promedios)) if (p.maximo) (metricas[`max_${t}`] ??= {})[est] = p.maximo.valor_ugm3;
    }
    const alto = new Set<string>();
    const bajo = new Set<string>();
    for (const valores of Object.values(metricas)) {
      const v = Object.entries(valores);
      if (v.length < 2) continue;
      const hi = Math.max(...v.map(([, x]) => x));
      const lo = Math.min(...v.map(([, x]) => x));
      v.filter(([, x]) => x === hi).forEach(([e]) => alto.add(e));
      v.filter(([, x]) => x === lo).forEach(([e]) => bajo.add(e));
    }
    out[c] = { alto, bajo, metricas };
  }
  return out;
}

/** Los rankings en el formato que espera el verificador de comparaciones. */
export const paraVerificador = (r: Record<string, RankingContaminante>): Rankings =>
  Object.fromEntries(Object.entries(r).map(([c, x]) => [c, { alto: x.alto, bajo: x.bajo }]));

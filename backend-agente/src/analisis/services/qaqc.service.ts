import { BadRequestException, Injectable } from '@nestjs/common';
import { ConocimientoService } from '../../conocimiento/services/conocimiento.service';
import { COLUMNAS_OBLIGATORIAS, FilaLarga, FilaLimpia } from '../../datos/interfaces/fila.interface';
import { UnidadesService } from '../../normativa/services/unidades.service';
import { fmtFechaHora, HORA_MS, indiceEsperado, parsearFecha } from '../../shared/utils/fechas.util';
import { fmtGen, mediana, rachaMaxima } from '../../shared/utils/numeros.util';
import { Advertencia, ResultadoQaqc, Severidad } from '../interfaces/analisis.interface';

export interface OpcionesQaqc {
  minRepresentatividad?: number;
  huecoLargoHoras?: number;
  maxRepetidos?: number;
  umbralMad?: number;
}

const adv = (
  codigo: string, severidad: Severidad, mensaje: string,
  estacion: string | null = null, variable: string | null = null, cantidad: number | null = null,
): Advertencia => ({ codigo, severidad, mensaje, estacion, variable, cantidad });

const pyLista = (xs: string[]) => `[${xs.map((x) => `'${x}'`).join(', ')}]`;
const ordenar = <T>(xs: T[], clave: (x: T) => string) => [...xs].sort((a, b) => (clave(a) < clave(b) ? -1 : clave(a) > clave(b) ? 1 : 0));

/**
 * Control de calidad (QA/QC) de datos en formato largo. Regla de diseño: nada se corrige ni se descarta en silencio.
 * Todo lo que se excluye de los cálculos (fechas inválidas, fuera de periodo, duplicados en conflicto, unidades
 * mezcladas) genera una advertencia con su código y cantidad. Lo que solo es sospechoso (negativos, valores
 * repetidos, atípicos) se conserva y se avisa. Los umbrales son criterios del proyecto, no de la norma.
 */
@Injectable()
export class QaqcService {
  constructor(
    private readonly conocimiento: ConocimientoService,
    private readonly unidades: UnidadesService,
  ) {}

  preparar(largo: FilaLarga[], periodo: string, opciones: OpcionesQaqc = {}): ResultadoQaqc {
    const base = this.conocimiento.base;
    const minimo = opciones.minRepresentatividad ?? base.datos_validos.representatividad_temporal_minima_pct;
    const huecoLargo = opciones.huecoLargoHoras ?? 24;
    const maxRepetidos = opciones.maxRepetidos ?? 24;
    const umbralMad = opciones.umbralMad ?? 15;

    if (largo.length) {
      const faltan = COLUMNAS_OBLIGATORIAS.filter((c) => !(c in largo[0]));
      if (faltan.length) throw new BadRequestException(`Faltan columnas obligatorias: [${faltan.join(', ')}]`);
    }

    const advertencias: Advertencia[] = [
      adv('DATOS_PRELIMINARES', 'info', 'Los datos de la RMCAB son preliminares: no tienen validación final de la SDA.'),
    ];

    // --- tipos ---
    let filas = largo.map((f) => ({ f, t: parsearFecha(f.fecha_hora) }));
    let n = filas.filter((x) => Number.isNaN(x.t)).length;
    if (n) {
      advertencias.push(adv('FECHA_INVALIDA', 'error', `${n} filas con fecha ilegible; se excluyen.`, null, null, n));
      filas = filas.filter((x) => !Number.isNaN(x.t));
    }
    const vacio = (v: FilaLarga['valor']) => v === null || v === undefined || v === '';
    const numerico = (v: FilaLarga['valor']): number => {
      if (vacio(v)) return NaN;
      const x = typeof v === 'number' ? v : Number(String(v).trim());
      return Number.isFinite(x) ? x : NaN;
    };
    let d: FilaLimpia[] = filas.map(({ f, t }) => ({ estacion: f.estacion, variable: f.variable, unidad: f.unidad ?? null, t, valor: numerico(f.valor) }));
    const conValor = filas.filter(({ f }) => !vacio(f.valor)).length;
    n = conValor - d.filter((x) => !Number.isNaN(x.valor)).length;
    if (n) advertencias.push(adv('VALOR_NO_NUMERICO', 'aviso', `${n} valores no numéricos pasan a faltante.`, null, null, n));

    // --- periodo y hora exacta ---
    const esperado = indiceEsperado(periodo);
    n = d.filter((x) => Math.floor((x.t % HORA_MS) / 60_000) !== 0).length + d.filter((x) => Math.floor((x.t % 60_000) / 1000) !== 0).length;
    if (n) {
      advertencias.push(adv('HORA_NO_EXACTA', 'error', `${n} filas no caen en hora exacta; se excluyen (se esperan promedios horarios).`, null, null, n));
      d = d.filter((x) => x.t % HORA_MS === 0);
    }
    const enPeriodo = new Set(esperado);
    const fuera = d.filter((x) => !enPeriodo.has(x.t));
    if (fuera.length) {
      const ts = fuera.map((x) => x.t);
      advertencias.push(adv('FUERA_DE_PERIODO', 'aviso',
        `${fuera.length} filas fuera de ${periodo} (${fmtFechaHora(Math.min(...ts))} a ${fmtFechaHora(Math.max(...ts))}); se excluyen.`,
        null, null, fuera.length));
      d = d.filter((x) => enPeriodo.has(x.t));
    }

    // --- duplicados ---
    const grupos = new Map<string, FilaLimpia[]>();
    for (const x of d) {
      const k = `${x.estacion}\u0000${x.variable}\u0000${x.t}`;
      (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(x);
    }
    const repetidos = [...grupos.values()].filter((g) => g.length > 1);
    if (repetidos.length) {
      const distintos = (g: FilaLimpia[]) => new Set(g.map((x) => x.valor).filter((v) => !Number.isNaN(v)));
      const nConf = repetidos.filter((g) => distintos(g).size > 1).length;
      const nIdent = repetidos.length - nConf;
      if (nIdent) advertencias.push(adv('DUPLICADO_IDENTICO', 'info', `${nIdent} horas repetidas con el mismo valor; se deja una.`, null, null, nIdent));
      if (nConf) advertencias.push(adv('DUPLICADO_CONFLICTO', 'aviso', `${nConf} horas repetidas con valores distintos; se dejan como faltante.`, null, null, nConf));
      d = ordenar(
        [...grupos.values()].map((g) => {
          const dist = distintos(g);
          return { ...g[0], unidad: g.find((x) => x.unidad !== null)?.unidad ?? null, valor: dist.size === 1 ? [...dist][0] : NaN };
        }),
        (x) => `${x.estacion}\u0000${x.variable}\u0000${String(x.t).padStart(16, '0')}`,
      );
    }

    // --- unidades por serie ---
    const series = this.agruparPorSerie(d);
    const excluir = new Set<string>();
    for (const [clave, g] of series) {
      const [est, variable] = clave.split('\u0000');
      const unidades = [...new Set(g.map((x) => x.unidad).filter((u): u is string => u !== null))];
      if (unidades.length > 1) {
        advertencias.push(adv('UNIDAD_MIXTA', 'error', `${est} / ${variable} trae varias unidades ${pyLista(unidades)}; la serie se excluye.`, est, variable, g.length));
        excluir.add(clave);
        continue;
      }
      const c = this.conocimiento.contaminanteDeVariable(variable);
      if (c !== null && unidades.length === 1) {
        try {
          this.unidades.aUgm3(1, c, unidades[0]);
        } catch (e) {
          advertencias.push(adv('UNIDAD_NO_CONVERTIBLE', 'error', `${est} / ${variable}: ${(e as Error).message}; la serie se excluye.`, est, variable, g.length));
          excluir.add(clave);
        }
      }
    }
    if (excluir.size) d = d.filter((x) => !excluir.has(`${x.estacion}\u0000${x.variable}`));

    // --- revisión serie por serie ---
    for (const [clave, g] of this.agruparPorSerie(d)) {
      const [est, variable] = clave.split('\u0000');
      const porHora = new Map(g.map((x) => [x.t, x.valor]));
      const s = esperado.map((t) => porHora.get(t) ?? NaN);
      const validos = s.filter((v) => !Number.isNaN(v)).length;
      const pct = (100 * validos) / esperado.length;
      const c = this.conocimiento.contaminanteDeVariable(variable);
      if (validos === 0) {
        advertencias.push(adv('SERIE_VACIA', 'aviso', `${est} / ${variable}: sin ningún dato válido en ${periodo}.`, est, variable, 0));
        continue;
      }
      if (c !== null && pct < minimo) {
        advertencias.push(adv('COBERTURA_BAJA', 'aviso',
          `${est} / ${variable}: ${validos} de ${esperado.length} horas válidas (${pct.toFixed(0)} %), menos del ${minimo} % mínimo; los datos son indicativos.`,
          est, variable, validos));
      }
      const hueco = rachaMaxima(s.map((v) => Number.isNaN(v)));
      if (hueco >= huecoLargo) advertencias.push(adv('HUECO_LARGO', 'aviso', `${est} / ${variable}: ${hueco} horas seguidas sin dato.`, est, variable, hueco));
      if (c === null) continue;

      const v = s.filter((x) => !Number.isNaN(x));
      const neg = v.filter((x) => x < 0).length;
      if (neg) {
        advertencias.push(adv('NEGATIVOS', 'aviso', `${est} / ${variable}: ${neg} concentraciones negativas (mínimo ${fmtGen(Math.min(...v))}); se conservan.`, est, variable, neg));
      }
      const repetido = rachaMaxima(s.map((x, i) => i > 0 && !Number.isNaN(x) && x === s[i - 1] && x !== 0)) + 1;
      if (repetido >= maxRepetidos) {
        advertencias.push(adv('VALORES_REPETIDOS', 'aviso', `${est} / ${variable}: ${repetido} horas seguidas con el mismo valor; posible sensor congelado.`, est, variable, repetido));
      }
      const med = mediana(v);
      const mad = mediana(v.map((x) => Math.abs(x - med)));
      if (mad > 0) {
        const nAt = v.filter((x) => (0.6745 * Math.abs(x - med)) / mad > umbralMad).length;
        if (nAt) {
          advertencias.push(adv('ATIPICOS', 'info',
            `${est} / ${variable}: ${nAt} valores muy alejados de la mediana (z modificado > ${fmtGen(umbralMad)}); se conservan, pueden ser episodios reales.`,
            est, variable, nAt));
        }
      }
    }
    return { datos: d, advertencias };
  }

  /** Series (estación y variable) en orden alfabético, como `groupby` de pandas. */
  private agruparPorSerie(d: FilaLimpia[]): Map<string, FilaLimpia[]> {
    const m = new Map<string, FilaLimpia[]>();
    for (const x of d) {
      const k = `${x.estacion}\u0000${x.variable}`;
      (m.get(k) ?? m.set(k, []).get(k)!).push(x);
    }
    return new Map([...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
}

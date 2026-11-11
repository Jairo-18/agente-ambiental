import { Injectable } from '@nestjs/common';
import { ConocimientoService } from '../../conocimiento/services/conocimiento.service';
import { FilaLarga, FilaLimpia } from '../../datos/interfaces/fila.interface';
import { MotorReglasService } from '../../normativa/services/motor-reglas.service';
import { PROMEDIOS_CORTOS } from '../../shared/constants/aire.constants';
import { HORA_MS, indiceEsperado, inicioDelDia, marcaDe } from '../../shared/utils/fechas.util';
import { cuenta, maximo, media, minimo, redondear2, suma } from '../../shared/utils/numeros.util';
import {
  ContaminanteHechos, EstacionHechos, Hechos, MeteoVariable, Punto, PromedioHechos, ResultadoAnalisis,
} from '../interfaces/analisis.interface';
import { EstadisticaService } from './estadistica.service';
import { QaqcService } from './qaqc.service';

const DEFINICIONES_METEOROLOGIA = [
  'Día con lluvia: día calendario con precipitación acumulada mayor que 0 mm.',
  'Temperatura mínima, máxima y velocidad máxima del viento: extremos de los promedios horarios.',
  'Si una estación mide la temperatura a varias alturas se usa la serie `Temperatura` (pendiente de confirmar).',
];

/**
 * Construye `hechos.json`: todo lo que el reporte puede afirmar, calculado por código (nunca por el modelo).
 * La clave es estación, contaminante y promedio.
 */
@Injectable()
export class HechosService {
  constructor(
    private readonly conocimiento: ConocimientoService,
    private readonly reglas: MotorReglasService,
    private readonly qaqc: QaqcService,
    private readonly estadistica: EstadisticaService,
  ) {}

  /** Corre el QA/QC y calcula los hechos del mes. Devuelve también los datos limpios (los gráficos los usan). */
  analizar(largo: FilaLarga[], periodo: string): ResultadoAnalisis {
    const { datos, advertencias } = this.qaqc.preparar(largo, periodo);
    const base = this.conocimiento.base;
    const minimoPct = base.datos_validos.representatividad_temporal_minima_pct;
    const nEsperados = this.estadistica.indice(periodo).length;

    const estaciones: Hechos['estaciones'] = {};
    // las estaciones salen de la entrada, no de los datos limpios: una excluida entera debe seguir visible
    for (const est of [...new Set(largo.map((f) => f.estacion).filter(Boolean))].sort()) {
      const contaminantes: Record<string, ContaminanteHechos> = {};
      for (const c of Object.keys(base.contaminantes)) {
        const serie = this.estadistica.serieHorariaUgm3(datos, est, c, periodo);
        if (serie === null) {
          contaminantes[c] = { disponible: false };
          continue;
        }
        const pct = this.estadistica.representatividadPct(serie);
        const evaluable = pct >= minimoPct;
        const cortos = [...new Set(base.limites.filter((x) => x.contaminante === c && (PROMEDIOS_CORTOS as readonly string[]).includes(x.promedio)).map((x) => x.promedio))].sort();
        contaminantes[c] = {
          disponible: true,
          n_validos: cuenta(serie),
          n_esperados: nEsperados,
          representatividad_pct: redondear2(pct),
          evaluable,
          media_mensual_ugm3: evaluable && cuenta(serie) ? redondear2(media(serie)) : null,
          promedios: Object.fromEntries(cortos.map((t) => [t, this.hechosPromedio(serie, c, t, evaluable, periodo)])),
        };
      }
      estaciones[est] = { contaminantes, meteorologia: this.hechosMeteo(datos, est, periodo) };
    }

    const excedenciasPorContaminante: Hechos['resumen']['excedencias_por_contaminante'] = {};
    const noEvaluables: Hechos['resumen']['estaciones_no_evaluables'] = [];
    for (const [est, e] of Object.entries(estaciones)) {
      for (const [c, x] of Object.entries(e.contaminantes)) {
        if (!x.disponible) continue;
        if (!x.evaluable) {
          noEvaluables.push({ estacion: est, contaminante: c, representatividad_pct: x.representatividad_pct });
          continue;
        }
        for (const [t, p] of Object.entries(x.promedios)) {
          const r = ((excedenciasPorContaminante[c] ??= {})[t] ??= { n_excedencias: 0, estaciones: [] });
          r.n_excedencias += p.n_excedencias;
          if (p.n_excedencias) r.estaciones.push(est);
        }
      }
    }

    const v = base.validez_promedios;
    const hechos: Hechos = {
      meta: {
        periodo,
        n_esperados: nEsperados,
        esquema: 'aire_mensual v1',
        norma: base.norma.nombre,
        datos_preliminares: true,
        representatividad_minima_pct: minimoPct,
        contaminantes: Object.keys(base.contaminantes),
        supuestos: [
          `Promedios de corto plazo: 8 h = ${v.ventanas['8h']}; 24 h = ${v.ventanas['24h']}. Horas válidas mínimas: ` +
            `${v.min_horas['8h']} de 8 y ${v.min_horas['24h']} de 24 (verificado: ${v.verificado ? 'sí' : 'no'}).`,
          `Gases convertidos a µg/m³ a ${base.condiciones_referencia.temperatura_c} °C y ${base.condiciones_referencia.presion_mmhg} mmHg.`,
          'Excede = promedio > límite, sin redondear.',
          `Una serie con menos del ${minimoPct} % de horas válidas es indicativa y no se evalúa.`,
          'Los límites anuales no se evalúan con un solo mes.',
        ],
        definiciones_meteorologia: DEFINICIONES_METEOROLOGIA,
      },
      estaciones,
      resumen: { excedencias_por_contaminante: excedenciasPorContaminante, estaciones_no_evaluables: noEvaluables },
      advertencias,
    };
    return { hechos, datos };
  }

  private hechosPromedio(serie: number[], c: string, tipo: string, evaluable: boolean, periodo: string): PromedioHechos {
    const lim = this.conocimiento.base.limites.find((x) => x.contaminante === c && x.promedio === tipo)!;
    const prom: Punto[] = this.estadistica.promedio(serie, tipo, periodo).filter((p) => !Number.isNaN(p.valor));
    const h: PromedioHechos = {
      regla_limite: lim.id, limite_ugm3: lim.limite, n_promedios_validos: prom.length,
      maximo: null, excedencias: [], n_excedencias: 0, niveles_excepcionales: [], cumple: null,
    };
    if (!prom.length) return h;

    const resultados = prom.map((p) => ({ p, r: this.reglas.evaluar(c, tipo, p.valor, 'µg/m3') }));
    const excedencias = resultados
      .filter(({ r }) => r.estado === 'excede')
      .map(({ p, r }) => ({ regla_id: lim.id, fecha_hora: marcaDe(p.t, tipo), valor_ugm3: redondear2(r.valor_ugm3)!, limite_ugm3: lim.limite }));
    const niveles = resultados
      .filter(({ r }) => r.nivel_excepcional)
      .map(({ p, r }) => ({ nivel: r.nivel_excepcional!, fecha_hora: marcaDe(p.t, tipo), valor_ugm3: redondear2(r.valor_ugm3)!, regla_id: r.reglas[r.reglas.length - 1] }));
    const iMax = resultados.reduce((mejor, x, i) => (x.p.valor > resultados[mejor].p.valor ? i : mejor), 0); // la primera, si hay empate
    const max = {
      valor_ugm3: redondear2(resultados[iMax].p.valor)!,
      fecha_hora: marcaDe(resultados[iMax].p.t, tipo),
      conclusion: resultados[iMax].r.conclusion,
    };

    if (evaluable) {
      return { ...h, maximo: max, excedencias, n_excedencias: excedencias.length, niveles_excepcionales: niveles, cumple: excedencias.length === 0 };
    }
    // datos indicativos: no entran en conclusiones (criterio de la SDA)
    return { ...h, indicativo: { maximo: max, n_excedencias: excedencias.length } };
  }

  /** Primera variable de `nombres` con datos en la estación (el orden del esquema decide la altura). */
  private serieMeteo(datos: FilaLimpia[], estacion: string, nombres: string[], periodo: string) {
    for (const n of nombres) {
      const g = datos.filter((x) => x.estacion === estacion && x.variable === n);
      if (g.some((x) => !Number.isNaN(x.valor))) {
        const porHora = new Map(g.map((x) => [x.t, x.valor]));
        return { nombre: n, unidad: g.find((x) => x.unidad !== null)?.unidad ?? null, serie: indiceEsperado(periodo).map((t) => porHora.get(t) ?? NaN) };
      }
    }
    return null;
  }

  /** Resumen meteorológico mensual. Temperatura y viento se resumen con promedios horarios. */
  private hechosMeteo(datos: FilaLimpia[], estacion: string, periodo: string): EstacionHechos['meteorologia'] {
    const canon = this.conocimiento.variablesCanonicas;
    const idx = indiceEsperado(periodo);
    const resumen = (clave: 'precipitacion' | 'temperatura' | 'viento_velocidad', f: (s: number[]) => Partial<MeteoVariable>): MeteoVariable => {
      const m = this.serieMeteo(datos, estacion, canon[clave].nombres_rmcab, periodo);
      if (!m) return { disponible: false };
      return {
        disponible: true, variable_origen: m.nombre, unidad_origen: m.unidad,
        representatividad_pct: redondear2(this.estadistica.representatividadPct(m.serie)), ...f(m.serie),
      };
    };
    return {
      precipitacion: resumen('precipitacion', (s) => {
        const porDia = new Map<number, number>();
        s.forEach((v, i) => {
          const dia = inicioDelDia(idx[i] - HORA_MS);
          porDia.set(dia, (porDia.get(dia) ?? 0) + (Number.isNaN(v) ? 0 : v));
        });
        return { total_mm: redondear2(suma(s)), dias_con_lluvia: [...porDia.values()].filter((x) => x > 0).length };
      }),
      temperatura: resumen('temperatura', (s) => ({ media_c: redondear2(media(s)), minima_c: redondear2(minimo(s)), maxima_c: redondear2(maximo(s)) })),
      viento_velocidad: resumen('viento_velocidad', (s) => ({ media_ms: redondear2(media(s)), maxima_ms: redondear2(maximo(s)) })),
    };
  }
}

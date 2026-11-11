import { readFileSync } from 'node:fs';
import {
  cargarOctubre, crearAnalisis, diferencias, GOLDEN_HECHOS, serieSintetica,
} from '../../../test/helpers/servicios';
import { FilaLarga } from '../../datos/interfaces/fila.interface';
import { HORA_MS, parsearFecha } from '../../shared/utils/fechas.util';
import { ContaminanteHechos, Hechos } from '../interfaces/analisis.interface';

const { hechos: servicio, estadistica } = crearAnalisis();
const PERIODO = '2026-10';
const ESTACIONES = ['Guaymaral', 'Kennedy', 'Puente Aranda'];

let largo: FilaLarga[];
let hechos: Hechos;
beforeAll(async () => {
  largo = await cargarOctubre();
  hechos = servicio.analizar(largo, PERIODO).hechos;
});

const cont = (est: string, c: string) => hechos.estaciones[est].contaminantes[c] as Extract<ContaminanteHechos, { disponible: true }>;

describe('HechosService.analizar (octubre de 2026)', () => {
  it('estructura básica', () => {
    expect(hechos.meta).toMatchObject({ periodo: PERIODO, n_esperados: 744 });
    expect(Object.keys(hechos.estaciones)).toEqual(ESTACIONES);
    for (const e of Object.values(hechos.estaciones)) expect(Object.keys(e.contaminantes)).toEqual(['PM10', 'PM2.5', 'SO2', 'NO2', 'O3', 'CO']);
  });

  it('los supuestos provisionales quedan declarados', () => {
    const texto = hechos.meta.supuestos.join(' ');
    expect(texto).toContain('verificado: no');
    expect(texto).toContain('sin redondear');
    expect(texto).toContain('75 %');
  });

  it('el ozono de Kennedy es indicativo y no se declara cumplimiento', () => {
    const o3 = cont('Kennedy', 'O3');
    expect(o3).toMatchObject({ n_validos: 417, evaluable: false, media_mensual_ugm3: null });
    const p = o3.promedios['8h'];
    expect(p).toMatchObject({ cumple: null, excedencias: [], maximo: null });
    expect(p.indicativo).toBeDefined();
    expect(hechos.resumen.estaciones_no_evaluables).toContainEqual({ estacion: 'Kennedy', contaminante: 'O3', representatividad_pct: 56.05 });
  });

  it('el SO2 de Puente Aranda, sin datos, no cumple ni excede', () => {
    const so2 = cont('Puente Aranda', 'SO2');
    expect(so2).toMatchObject({ n_validos: 0, evaluable: false });
    expect(Object.values(so2.promedios).every((p) => p.cumple === null)).toBe(true);
  });

  /** Control independiente: sin pasar por el servicio de estadística ni por el motor de reglas. */
  function diasQueExceden(est: string, variable: string, limite: number) {
    const porDia = new Map<string, number[]>();
    for (const f of largo.filter((x) => x.estacion === est && x.variable === variable && x.valor !== null)) {
      const dia = new Date(parsearFecha(f.fecha_hora) - HORA_MS).toISOString().slice(0, 10);
      (porDia.get(dia) ?? porDia.set(dia, []).get(dia)!).push(Number(f.valor));
    }
    const medias = [...porDia.entries()].filter(([, v]) => v.length >= 18).map(([d, v]) => [d, v.reduce((a, b) => a + b, 0) / v.length] as const);
    return { exceden: medias.filter(([, m]) => m > limite).map(([d]) => d).sort(), maximo: Math.max(...medias.map(([, m]) => m)), n: medias.length };
  }

  it.each(ESTACIONES.flatMap((e) => [[e, 'PM10', 75], [e, 'PM2.5', 37]] as const))(
    'las excedencias de particulado coinciden con un cálculo independiente (%s, %s)',
    (est, c, limite) => {
      const esperado = diasQueExceden(est, c, limite);
      const p = cont(est, c).promedios['24h'];
      expect(p.excedencias.map((e) => e.fecha_hora)).toEqual(esperado.exceden);
      expect(p.cumple).toBe(esperado.exceden.length === 0);
      expect(Math.abs(p.maximo!.valor_ugm3 - esperado.maximo)).toBeLessThan(0.006);
      expect(p.n_promedios_validos).toBe(esperado.n);
    },
  );

  it('Kennedy tiene una excedencia de PM10 y una de PM2.5 en octubre', () => {
    const r = hechos.resumen.excedencias_por_contaminante;
    expect(r.PM10['24h']).toEqual({ n_excedencias: 1, estaciones: ['Kennedy'] });
    expect(r['PM2.5']['24h']).toEqual({ n_excedencias: 1, estaciones: ['Kennedy'] });
  });

  it('la excedencia cita regla, valor y límite', () => {
    const e = cont('Kennedy', 'PM10').promedios['24h'].excedencias[0];
    expect(e).toMatchObject({ regla_id: 'LIM-PM10-24H', limite_ugm3: 75, fecha_hora: '2026-10-28' });
    expect(e.valor_ugm3).toBeGreaterThan(75);
  });

  it('el nivel de prevención del PM2.5 se registra con su regla', () => {
    const p = cont('Kennedy', 'PM2.5').promedios['24h'];
    expect(p.maximo!.valor_ugm3).toBeGreaterThanOrEqual(38); // piso de prevención, Tabla 4
    expect(p.niveles_excepcionales.map((n) => n.nivel)).toEqual(['prevencion']);
    expect(p.niveles_excepcionales[0].regla_id).toBe('NIV-PM25-24H-PREVENCION');
  });

  it('los gases horarios coinciden con el control independiente', () => {
    for (const est of ESTACIONES) {
      const x = largo.filter((f) => f.estacion === est && f.variable === 'NO2' && f.valor !== null).map((f) => Number(f.valor));
      const p = cont(est, 'NO2').promedios['1h'];
      expect(Math.abs(p.maximo!.valor_ugm3 - Math.max(...x) * 1.8804)).toBeLessThan(0.006);
      expect(p.n_excedencias).toBe(x.filter((v) => v * 1.8804 > 200).length);
    }
  });

  it('el resultado es JSON y reproducible', () => {
    const otra = servicio.analizar(largo, PERIODO).hechos;
    expect(JSON.stringify(otra)).toBe(JSON.stringify(hechos));
    expect(() => JSON.parse(JSON.stringify(hechos))).not.toThrow();
    expect(JSON.stringify(hechos)).not.toContain('NaN');
  });

  it('las advertencias reales incluyen el ozono de Kennedy', () => {
    expect(hechos.advertencias.some((a) => a.codigo === 'COBERTURA_BAJA' && a.estacion === 'Kennedy' && a.variable === 'OZONO')).toBe(true);
  });

  it('una serie con unidad mixta queda no disponible en los hechos', () => {
    const d = serieSintetica(estadistica.indice(PERIODO), { estacion: 'X', variable: 'NO2', unidad: 'ppb', valores: 10 });
    d[0].unidad = 'µg/m3';
    const h = servicio.analizar(d, PERIODO).hechos;
    expect(h.estaciones.X.contaminantes.NO2).toEqual({ disponible: false });
    expect(h.advertencias.some((a) => a.codigo === 'UNIDAD_MIXTA')).toBe(true);
  });

  it('la meteorología se resume por estación', () => {
    const m = hechos.estaciones.Guaymaral.meteorologia;
    expect(m.precipitacion.disponible).toBe(true);
    expect(m.precipitacion.dias_con_lluvia).toBeGreaterThanOrEqual(0);
    expect(m.temperatura).toMatchObject({ disponible: true, variable_origen: 'Temperatura' });
    expect(m.temperatura.minima_c!).toBeLessThan(m.temperatura.maxima_c!);
  });
});

describe('paridad con el motor Python (hechos.json de octubre de 2026)', () => {
  it('el análisis en TypeScript da los mismos hechos que el motor Python, cifra por cifra', () => {
    const golden = JSON.parse(readFileSync(GOLDEN_HECHOS, 'utf-8'));
    // única diferencia deliberada: el reporte dice "verificado: no" en vez de "verificado: False" (repr de Python)
    golden.meta.supuestos = golden.meta.supuestos.map((s: string) => s.replace('verificado: False', 'verificado: no'));
    const actual = JSON.parse(JSON.stringify(hechos));
    const difs = diferencias(actual, golden);
    expect(difs).toEqual([]);
  });

  it('la tolerancia numérica de la comparación es solo de redondeo (0,0101): una diferencia real sí se detecta', () => {
    expect(diferencias({ a: 80.24 }, { a: 80.25 })).toEqual([]);
    expect(diferencias({ a: 80.24 }, { a: 80.3 })).toHaveLength(1);
  });
});

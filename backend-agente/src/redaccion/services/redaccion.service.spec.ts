import { cargarOctubre, crearAnalisis } from '../../../test/helpers/servicios';
import { excedencias, noEvaluables, rankings } from '../../analisis/hechos.util';
import { Hechos } from '../../analisis/interfaces/analisis.interface';
import { diaTexto } from '../../shared/utils/fechas.util';
import { numerosPermitidos, verificar } from '../../verificacion/verificador';
import { SECCIONES } from '../constants/redaccion.constants';
import { PlantillasService } from './plantillas.service';
import { RedaccionService } from './redaccion.service';

const plantillas = new PlantillasService();
const redaccion = new RedaccionService(plantillas);
let hechos: Hechos;
beforeAll(async () => {
  hechos = crearAnalisis().hechos.analizar(await cargarOctubre(), '2026-10').hechos;
});

const BUENA_PM10 = 'Kennedy registró la media mensual más alta de PM10, con 35.82 µg/m³, y el máximo diario más alto, de 80.24 µg/m³ el 28 de octubre.';

/** Un "modelo" falso que devuelve respuestas guionadas y recuerda los pedidos que recibió. */
function modelo(...respuestas: (string | Error)[]) {
  const pedidos: string[] = [];
  const llm = async (_sistema: string, usuario: string) => {
    pedidos.push(usuario);
    const r = respuestas.shift() ?? '';
    if (r instanceof Error) throw r;
    return r;
  };
  return { llm, pedidos };
}

describe('textos de plantilla (escritos por el código)', () => {
  it('diaTexto', () => {
    expect(diaTexto('2026-10-28')).toBe('28 de octubre');
    expect(diaTexto('2026-10-05 14:00')).toBe('5 de octubre a las 14:00');
  });

  it.each(Object.keys(SECCIONES))('el texto de plantilla de "%s" no trae ninguna cifra que no esté en los hechos', (seccion) => {
    const v = verificar(plantillas.texto(seccion, hechos), numerosPermitidos(hechos), plantillas.exigidos(hechos, SECCIONES[seccion]));
    expect(v).toMatchObject({ ok: true, inventadas: [], faltan: [] });
  });

  it('el resumen menciona a Kennedy, sus excedencias y lo no evaluable', () => {
    const t = plantillas.texto('resumen', hechos);
    for (const s of ['Kennedy', '80.24', '41.29', '28 de octubre', 'Puente Aranda', 'indicativas', 'preliminares']) expect(t).toContain(s);
  });

  it('ayudantes de hechos', () => {
    expect(new Set(excedencias(hechos).map((e) => e.estacion))).toEqual(new Set(['Kennedy']));
    expect(noEvaluables(hechos).map((e) => `${e.estacion}/${e.contaminante}`).sort()).toEqual(['Kennedy/O3', 'Puente Aranda/SO2']);
    expect(plantillas.exigidos(hechos, ['PM10'])).toEqual(['Kennedy']);
  });

  it('los rankings de octubre', () => {
    const r = rankings(hechos);
    expect(r.NO2.alto).toEqual(new Set(['Puente Aranda']));
    expect(r.NO2.bajo).toEqual(new Set(['Guaymaral']));
    expect(r.PM10.alto).toEqual(new Set(['Kennedy']));
    expect(r.PM10.bajo).toEqual(new Set(['Guaymaral']));
    // SO2: Guaymaral tiene el máximo más alto y Kennedy la media más alta; Puente Aranda no tiene datos y no cuenta
    expect(r.SO2.alto).toEqual(new Set(['Guaymaral', 'Kennedy']));
    expect(r.SO2.bajo.has('Puente Aranda')).toBe(false);
    expect(r.O3.alto).toEqual(new Set(['Guaymaral']));
    expect(r.O3.bajo).toEqual(new Set(['Puente Aranda'])); // Kennedy no es evaluable
  });
});

describe('RedaccionService.redactar', () => {
  it('sin modelo la redacción es la plantilla', async () => {
    const r = await redaccion.redactar('resumen', hechos, null);
    expect(r).toMatchObject({ origen: 'plantilla', texto: plantillas.texto('resumen', hechos) });
  });

  it('un modelo que cumple se acepta al primer intento', async () => {
    const { llm } = modelo(BUENA_PM10);
    const r = await redaccion.redactar('comentario_pm10', hechos, llm);
    expect(r).toMatchObject({ origen: 'llm', intentos: 1 });
    expect(r.verificacion.ok).toBe(true);
    expect(r.texto.startsWith(BUENA_PM10)).toBe(true);
  });

  it('con modelo, lo normativo lo sigue escribiendo el código', async () => {
    const { llm } = modelo('Puente Aranda tuvo el NO2 más alto, con 51.03 µg/m³.');
    const r = await redaccion.redactar('comentario_gases', hechos, llm);
    expect(r.origen).toBe('llm');
    expect(r.texto.startsWith('Puente Aranda tuvo el NO2 más alto, con 51.03 µg/m³.')).toBe(true);
    for (const s of ['No se registraron excedencias', 'indicativas', 'Kennedy']) expect(r.texto).toContain(s);
  });

  it('el resumen y las conclusiones no usan el modelo', async () => {
    const { llm, pedidos } = modelo('texto del modelo', 'texto del modelo');
    for (const s of ['resumen', 'conclusiones']) {
      const r = await redaccion.redactar(s, hechos, llm);
      expect(r.origen).toBe('plantilla');
      expect(r.texto).not.toContain('texto del modelo');
    }
    expect(pedidos).toEqual([]);
  });

  it('el modelo no puede hablar de límites ni de cumplimiento', async () => {
    const { llm } = modelo('Kennedy excedió el límite de PM10 con 80.24 µg/m³.');
    const r = await redaccion.redactar('comentario_pm10', hechos, llm, 1);
    expect(r.origen).toBe('plantilla');
    expect(r.problemas[0]).toContain('prohibidas');
    expect(r.problemas[0]).toContain('límite');
  });

  it('el modelo no ve límites, excedencias ni series no evaluables', async () => {
    const { llm, pedidos } = modelo('x');
    await redaccion.redactar('comentario_gases', hechos, llm, 1);
    const p = pedidos[0].toLowerCase();
    for (const prohibida of ['limite', 'excedencias', 'cumple', 'evaluable']) expect(p).not.toContain(prohibida);
    expect(p).toContain('puente aranda');
    expect(p).toContain('kennedy'); // sí ve las series evaluables de cada estación
  });

  it('el modelo solo ve el subconjunto de hechos de la sección', async () => {
    const { llm, pedidos } = modelo('x 999');
    await redaccion.redactar('comentario_pm10', hechos, llm, 1);
    expect(pedidos[0]).toContain('PM10');
    for (const otro of ['NO2', 'O3', 'PM2.5']) expect(pedidos[0]).not.toContain(otro);
  });

  it('el modelo recibe el ranking ya calculado', async () => {
    const { llm, pedidos } = modelo('x');
    await redaccion.redactar('comentario_gases', hechos, llm, 1);
    expect(pedidos[0]).toContain('ranking_entre_estaciones');
    expect(pedidos[0]).toContain('estacion_mas_alta');
  });

  it('una cifra inventada se corrige con realimentación', async () => {
    const { llm, pedidos } = modelo('Kennedy registró PM10 con 81.9 µg/m³.', 'Kennedy registró PM10 con 80.24 µg/m³.');
    const r = await redaccion.redactar('comentario_pm10', hechos, llm);
    expect(r).toMatchObject({ origen: 'llm', intentos: 2 });
    expect(pedidos[1]).toContain('81.9');
    expect(pedidos[1]).toContain('rechazado');
    expect(r.problemas[0]).toContain('81.9');
  });

  it('un ranking falso se rechaza aunque las cifras existan', async () => {
    const falsa = 'Guaymaral registró los valores más altos para SO2 (42.42 µg/m³) y NO2 (93.08 µg/m³).';
    const r = await redaccion.redactar('comentario_gases', hechos, modelo(falsa, falsa).llm, 2);
    expect(r.origen).toBe('plantilla');
    expect(r.problemas[0]).toContain('ranking');
    expect(r.problemas[0]).toContain('NO2');
  });

  it('el modelo corrige el ranking tras la realimentación', async () => {
    const { llm, pedidos } = modelo('Guaymaral tuvo los valores más altos de NO2 (93.08 µg/m³).', 'Puente Aranda tuvo el NO2 más alto (132.57 µg/m³).');
    const r = await redaccion.redactar('comentario_gases', hechos, llm);
    expect(r).toMatchObject({ origen: 'llm', intentos: 2 });
    expect(pedidos[1]).toContain('Comparaciones incorrectas');
  });

  it('si el modelo no corrige cae a la plantilla y lo registra', async () => {
    const { llm } = modelo('Kennedy tuvo 999 µg/m³.', 'Kennedy tuvo 999 µg/m³.', 'Kennedy tuvo 999 µg/m³.');
    const r = await redaccion.redactar('comentario_pm10', hechos, llm, 3);
    expect(r.origen).toBe('plantilla');
    expect(r.problemas).toHaveLength(3);
    expect(r.texto).not.toContain('999');
    expect(r.texto).toBe(plantillas.texto('comentario_pm10', hechos));
  });

  it('con Ollama caído cae a la plantilla', async () => {
    const caido = Object.assign(new Error('sin servidor'), { name: 'ConnectionError' });
    const r = await redaccion.redactar('comentario_pm10', hechos, modelo(caido).llm);
    expect(r.origen).toBe('plantilla');
    expect(r.problemas[0]).toContain('ConnectionError');
  });

  it('redactarTodas devuelve las cinco secciones', async () => {
    const todas = await redaccion.redactarTodas(hechos, null);
    expect(Object.keys(todas)).toEqual(['resumen', 'comentario_pm10', 'comentario_pm25', 'comentario_gases', 'conclusiones']);
  });
});

import { cargarOctubre, crearAnalisis } from '../../../test/helpers/servicios';
import { Hechos } from '../../analisis/interfaces/analisis.interface';
import { FilaLimpia } from '../../datos/interfaces/fila.interface';
import { GraficosService, marcas } from './graficos.service';

const { conocimiento, estadistica, hechos: servicio } = crearAnalisis();
const graficos = new GraficosService(conocimiento, estadistica);
let hechos: Hechos;
let datos: FilaLimpia[];
beforeAll(async () => {
  ({ hechos, datos } = servicio.analizar(await cargarOctubre(), '2026-10'));
});

const esPng = (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

describe('marcas del eje', () => {
  it.each([0.5, 4, 8.6, 41.3, 56.1, 90.2, 1316.7, 5000])('el eje cubre siempre el valor más alto (%s)', (max) => {
    const m = marcas(max);
    expect(m[0]).toBe(0);
    expect(m[m.length - 1]).toBeGreaterThanOrEqual(max);
    expect(m.length).toBeLessThanOrEqual(9);
    expect(m).toEqual([...m].sort((a, b) => a - b));
  });
});

describe('GraficosService', () => {
  it('el gráfico diario de PM2.5 es un PNG con las dimensiones declaradas', () => {
    const f = graficos.graficoDiario(datos, hechos, 'PM2.5', '2026-10')!;
    expect(esPng(f.png)).toBe(true);
    expect(f).toMatchObject({ ancho: 1200, alto: 600 });
    expect(f.png.length).toBeGreaterThan(20_000); // trae contenido, no un lienzo en blanco
  });

  it('el gráfico de gases es un PNG', () => {
    const f = graficos.graficoGases(hechos)!;
    expect(esPng(f.png)).toBe(true);
    expect(f).toMatchObject({ ancho: 1350, alto: 480 });
  });

  it('sin series evaluables no hay gráfico (en vez de uno vacío)', () => {
    const vacio: Hechos = JSON.parse(JSON.stringify(hechos));
    for (const e of Object.values(vacio.estaciones)) for (const c of Object.keys(e.contaminantes)) e.contaminantes[c] = { disponible: false };
    expect(graficos.graficoDiario([], vacio, 'PM10', '2026-10')).toBeNull();
    expect(graficos.graficoGases(vacio)).toBeNull();
  });

  it('un contaminante cuyas series no son evaluables no se dibuja', () => {
    const h: Hechos = JSON.parse(JSON.stringify(hechos));
    for (const e of Object.values(h.estaciones)) {
      const x = e.contaminantes['PM10'];
      if (x.disponible) x.evaluable = false;
    }
    expect(graficos.graficoDiario(datos, h, 'PM10', '2026-10')).toBeNull();
  });
});

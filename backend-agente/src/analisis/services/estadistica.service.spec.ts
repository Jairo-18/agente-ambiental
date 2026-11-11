import { crearAnalisis } from '../../../test/helpers/servicios';
import { FilaLimpia } from '../../datos/interfaces/fila.interface';

const { estadistica } = crearAnalisis();
const PERIODO = '2026-10';
const HORAS = estadistica.indice(PERIODO);
const constante = (v = 10) => HORAS.map(() => v);
const hora = (texto: string) => HORAS.indexOf(Date.parse(`${texto.replace(' ', 'T')}:00Z`));
const dia = (texto: string) => Date.parse(`${texto}T00:00:00Z`);
const valorDelDia = (p: ReturnType<typeof estadistica.promedio>, texto: string) => p.find((x) => x.t === dia(texto))?.valor;

describe('EstadisticaService.promedio', () => {
  it('24 h es día calendario y la hora 00:00 cierra el día anterior', () => {
    const s = constante();
    s[hora('2026-10-02 00:00')] = 34; // última hora del 1 de octubre
    const p = estadistica.promedio(s, '24h', PERIODO);
    expect(p).toHaveLength(31);
    expect(valorDelDia(p, '2026-10-01')).toBeCloseTo((23 * 10 + 34) / 24, 9);
    expect(valorDelDia(p, '2026-10-02')).toBeCloseTo(10, 9);
    expect(valorDelDia(p, '2026-10-31')).toBeDefined();
    expect(valorDelDia(p, '2026-11-01')).toBeUndefined();
  });

  it('24 h exige 18 horas válidas', () => {
    const s = constante();
    const inicio = hora('2026-10-05 01:00'); // las 24 horas del día 5 van de 01:00 a 24:00
    for (let i = 0; i < 6; i++) s[inicio + i] = NaN; // quedan 18 -> válido
    expect(valorDelDia(estadistica.promedio(s, '24h', PERIODO), '2026-10-05')).not.toBeNaN();
    s[inicio + 6] = NaN; // quedan 17 -> no válido
    expect(valorDelDia(estadistica.promedio(s, '24h', PERIODO), '2026-10-05')).toBeNaN();
  });

  it('8 h es media móvil retrospectiva con 6 horas mínimas', () => {
    const s = constante();
    for (let i = 100; i < 103; i++) s[i] = NaN; // tres horas sin dato
    const p = estadistica.promedio(s, '8h', PERIODO);
    expect(p[107].valor).toBeNaN(); // ventana 100..107: 5 válidas -> no vale
    expect(p[108].valor).toBe(10); // ventana 101..108: 6 válidas -> vale
    expect(p[120].valor).toBe(10);
  });

  it('8 h con valores distintos', () => {
    const s = HORAS.map((_, i) => i);
    expect(estadistica.promedio(s, '8h', PERIODO)[20].valor).toBeCloseTo((13 + 14 + 15 + 16 + 17 + 18 + 19 + 20) / 8, 9);
  });

  it('las primeras horas usan la ventana parcial si alcanza el mínimo', () => {
    const p = estadistica.promedio(constante(), '8h', PERIODO);
    expect(p[4].valor).toBeNaN(); // 5 horas: no alcanza
    expect(p[5].valor).toBe(10); // 6 horas: alcanza
  });

  it('1 h es el propio dato', () => {
    expect(estadistica.promedio(constante(7), '1h', PERIODO).map((x) => x.valor)).toEqual(constante(7));
  });

  it('un promedio no soportado lanza error', () => {
    expect(() => estadistica.promedio(constante(), 'anual', PERIODO)).toThrow(/no soportado/);
  });
});

describe('EstadisticaService series', () => {
  it('representatividad: 558 de 744 es 75 %', () => {
    const s = constante();
    for (let i = 0; i < 186; i++) s[i] = NaN;
    expect(estadistica.representatividadPct(s)).toBeCloseTo(75, 9);
  });

  it('la serie horaria convierte gases a µg/m³ y devuelve null si no existe', () => {
    const d: FilaLimpia[] = [100, 50, NaN].map((valor, i) => ({ estacion: 'K', variable: 'NO2', unidad: 'ppb', t: HORAS[i], valor }));
    const s = estadistica.serieHorariaUgm3(d, 'K', 'NO2', PERIODO)!;
    expect(s).toHaveLength(744);
    expect(s[0]).toBeCloseTo(188.04, 2);
    expect(s[1]).toBeCloseTo(94.02, 2);
    expect(s.slice(2).every(Number.isNaN)).toBe(true);
    expect(estadistica.serieHorariaUgm3(d, 'K', 'PM10', PERIODO)).toBeNull();
    expect(estadistica.serieHorariaUgm3(d, 'otra', 'NO2', PERIODO)).toBeNull();
  });
});

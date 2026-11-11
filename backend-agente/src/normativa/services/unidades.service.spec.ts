import { crearNorma } from '../../../test/helpers/servicios';

const { unidades, conocimiento } = crearNorma();
const a = (v: number, c: string, u: string) => unidades.aUgm3(v, c, u);

describe('UnidadesService', () => {
  it('casos conocidos de la tabla de la SDA', () => {
    expect(a(100, 'NO2', 'ppb')).toBeCloseTo(188.04, 2);
    expect(a(100, 'SO2', 'ppb')).toBeCloseTo(261.86, 2);
    expect(a(50, 'O3', 'ppb')).toBeCloseTo(98.1, 2);
    expect(a(1, 'CO', 'ppm')).toBeCloseTo(1144.9, 2);
  });

  it('el límite de CO a 8 h equivale a unos 4,37 ppm', () => {
    expect(Math.abs(a(4.37, 'CO', 'ppm') - 5003)).toBeLessThan(5);
    expect(a(4.36, 'CO', 'ppm')).toBeLessThan(5000);
    expect(a(4.37, 'CO', 'ppm')).toBeGreaterThan(5000);
  });

  it('ppm y ppb son consistentes', () => {
    expect(a(0.1, 'NO2', 'ppm')).toBeCloseTo(a(100, 'NO2', 'ppb'), 6);
    expect(a(1000, 'CO', 'ppb')).toBeCloseTo(a(1, 'CO', 'ppm'), 6);
  });

  it('los microgramos pasan sin cambio y acepta variantes de escritura', () => {
    for (const u of ['µg/m3', 'μg/m3', 'ug/m3', 'µg/m³', ' UG/M3 ']) expect(a(37, 'PM2.5', u)).toBe(37);
    expect(a(0.5, 'CO', 'mg/m3')).toBe(500);
  });

  it('NaN entra, NaN sale', () => {
    expect(a(NaN, 'NO2', 'ppb')).toBeNaN();
  });

  it.each([
    ['PM10', 'ppb'], // un particulado no tiene ppb
    ['NO2', 'furlongs'], // unidad inventada
    ['NO2', ''],
  ])('unidad incompatible o desconocida (%s, "%s") lanza error', (c, u) => {
    expect(() => a(10, c, u)).toThrow();
  });

  it('una variable sin norma lanza error', () => {
    expect(() => a(10, 'NOX', 'ppb')).toThrow(/sin norma/);
  });

  it('los nombres de la RMCAB se traducen a contaminante', () => {
    expect(conocimiento.contaminanteDeVariable('OZONO')).toBe('O3');
    expect(conocimiento.contaminanteDeVariable('PM2.5')).toBe('PM2.5');
    expect(conocimiento.contaminanteDeVariable('NOX')).toBeNull();
    expect(conocimiento.contaminanteDeVariable('Temperatura')).toBeNull();
  });
});

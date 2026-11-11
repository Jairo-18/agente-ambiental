import { crearNorma } from '../../../test/helpers/servicios';

const { conocimiento, reglas } = crearNorma();
const ev = (c: string, p: string, v: number, u = 'µg/m3') => reglas.evaluar(c, p, v, u);

describe('MotorReglasService', () => {
  it('el límite exacto cumple y lo que pasa excede', () => {
    expect(ev('PM10', '24h', 75).estado).toBe('cumple');
    expect(ev('PM10', '24h', 75.1).estado).toBe('excede');
    expect(ev('PM2.5', '24h', 37).estado).toBe('cumple');
    expect(ev('PM2.5', '24h', 37.1).estado).toBe('excede');
  });

  it('la conclusión cita regla, fuente y pasos', () => {
    const r = ev('PM10', '24h', 80);
    expect(r.estado).toBe('excede');
    expect(r.reglas).toEqual(['LIM-PM10-24H']);
    expect(r.conclusion).toContain('excede');
    expect(r.conclusion).toContain('75');
    expect(r.fuentes.some((f) => f.includes('Res. 2254/2017'))).toBe(true);
    expect(r.explicacion[0]).toContain('LIM-PM10-24H');
  });

  it('niveles excepcionales de PM10', () => {
    expect(ev('PM10', '24h', 154).nivel_excepcional).toBeNull();
    expect(ev('PM10', '24h', 155).nivel_excepcional).toBe('prevencion');
    expect(ev('PM10', '24h', 255).nivel_excepcional).toBe('alerta');
    expect(ev('PM10', '24h', 355).nivel_excepcional).toBe('emergencia');
    expect(ev('PM10', '24h', 900).nivel_excepcional).toBe('emergencia'); // sin tope superior
  });

  it('un valor entre enteros de la Tabla 4 va al nivel inferior y lo dice', () => {
    const r = ev('PM10', '24h', 254.5);
    expect(r.nivel_excepcional).toBe('prevencion');
    expect(r.explicacion.some((p) => p.includes('supuesto'))).toBe(true);
  });

  it('el NO2 a 1 h: prevención por debajo del límite es la rareza de la norma', () => {
    const r = ev('NO2', '1h', 195);
    expect(r.estado).toBe('cumple');
    expect(r.nivel_excepcional).toBe('prevencion');
    expect(r.conclusion).toContain('cumple');
    expect(r.conclusion).toContain('prevención');
    expect(ev('NO2', '1h', 201).estado).toBe('excede');
  });

  it('los gases se convierten antes de comparar', () => {
    const r = ev('NO2', '1h', 100, 'ppb'); // 100 ppb = 188,04 µg/m³ -> cumple
    expect(r.estado).toBe('cumple');
    expect(r.valor_ugm3).toBeCloseTo(188.04, 2);
    expect(r.explicacion.some((p) => p.includes('Conversión'))).toBe(true);
    expect(ev('NO2', '1h', 107, 'ppb').estado).toBe('excede'); // 201,2 µg/m³
    expect(ev('CO', '8h', 4.36, 'ppm').estado).toBe('cumple');
    expect(ev('CO', '8h', 4.37, 'ppm').estado).toBe('excede');
  });

  it('un promedio sin regla no declara cumplimiento', () => {
    const r = ev('PM10', '1h', 10);
    expect(r.estado).toBe('sin_regla');
    expect(r.reglas).toEqual([]);
    expect(ev('O3', '1h', 10, 'ppb').estado).toBe('sin_regla');
  });

  it('sin dato no cumple ni excede', () => {
    const r = ev('PM10', '24h', NaN);
    expect(r.estado).toBe('sin_dato');
    expect(r.valor).toBeNaN();
  });

  it('una unidad mala propaga el error', () => {
    expect(() => ev('PM10', '24h', 10, 'ppb')).toThrow();
  });

  it('propiedad sobre toda la base: cada límite se comporta justo en el borde', () => {
    for (const x of conocimiento.base.limites) {
      expect(ev(x.contaminante, x.promedio, x.limite).estado).toBe('cumple');
      const r = ev(x.contaminante, x.promedio, x.limite * 1.001);
      expect(r.estado).toBe('excede');
      expect(r.reglas).toContain(x.id);
    }
  });

  it('propiedad: cada nivel de la Tabla 4 se alcanza en su mínimo', () => {
    const anterior = { prevencion: null, alerta: 'prevencion', emergencia: 'alerta' } as const;
    for (const n of conocimiento.base.niveles_excepcionales) {
      for (const nivel of ['prevencion', 'alerta', 'emergencia'] as const) {
        const minimo = n[nivel][0];
        expect(ev(n.contaminante, n.promedio, minimo).nivel_excepcional).toBe(nivel);
        expect(ev(n.contaminante, n.promedio, minimo - 0.5).nivel_excepcional).toBe(anterior[nivel]);
      }
    }
  });

  it('los ids de las reglas son únicos', () => {
    const ids = reglas.reglas.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

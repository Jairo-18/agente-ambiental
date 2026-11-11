import { crearNorma } from '../../../test/helpers/servicios';
import { extraerNumeros } from '../../verificacion/verificador';

const { conocimiento, fragmentos } = crearNorma();
const todos = fragmentos.construir();
const porClave = Object.fromEntries(todos.map((f) => [f.clave, f]));
const cifras = (texto: string) => new Set(extraerNumeros(texto).map((n) => n.valor));

describe('FragmentosService', () => {
  it('claves únicas y campos completos', () => {
    expect(new Set(todos.map((f) => f.clave)).size).toBe(todos.length);
    // 39 de la Res. 2254/2017 + 29 de reportes ciudadanos (11 normas y rutas, 7 rutas por tipo, 9 canales, prioridad, aviso)
    expect(todos).toHaveLength(68);
    for (const f of todos) {
      expect(f.texto && f.fuente && f.titulo).toBeTruthy();
      expect(['norma', 'limite', 'criterio', 'meta', 'nivel', 'ica', 'metodo', 'supuesto', 'ruta', 'canal']).toContain(f.tipo);
    }
  });

  it('hay un fragmento por cada regla de la base', () => {
    const base = conocimiento.base;
    for (const r of [...base.limites, ...base.metas_2030]) expect(porClave[r.id]).toBeDefined();
    expect(todos.filter((f) => f.tipo === 'ica')).toHaveLength(base.ica_categorias.length);
    expect(todos.filter((f) => f.tipo === 'nivel')).toHaveLength(base.niveles_excepcionales.length);
  });

  it('las cifras de cada límite coinciden con el YAML', () => {
    for (const r of conocimiento.base.limites) {
      expect(cifras(porClave[r.id].texto).has(r.limite)).toBe(true);
      expect(porClave[r.id].fuente).toBe(r.fuente);
    }
  });

  it('los niveles excepcionales traen todos los rangos, incluida la rareza del NO2', () => {
    for (const n of conocimiento.base.niveles_excepcionales) {
      const f = porClave[`NIV-${n.contaminante.replace('.', '')}-${n.promedio.toUpperCase()}`];
      for (const nivel of ['prevencion', 'alerta', 'emergencia'] as const) expect(cifras(f.texto).has(n[nivel][0])).toBe(true);
    }
    expect(porClave['NIV-NO2-1H'].texto).toContain('190');
    expect(porClave['NIV-NO2-1H'].texto).toContain('200');
  });

  it('el límite cambiado en 2018 se explica', () => {
    const t = porClave['LIM-PM10-24H'].texto;
    expect(t).toContain('75');
    expect(t).toContain('100');
    expect(t).toContain('2018-07-01');
  });

  it('lo provisional está marcado como no verificado, y el hueco del ICA se dice', () => {
    expect(porClave['SUPUESTO-VALIDEZ-PROMEDIOS'].verificado).toBe(false);
    expect(porClave['LIMITES-DE-LA-BASE'].verificado).toBe(false);
    expect(porClave['LIMITES-DE-LA-BASE'].texto).toContain('Tabla 6');
    expect(porClave['LIM-PM25-24H'].verificado).toBe(true);
  });

  it('cada gas tiene su fragmento de conversión con el factor del YAML', () => {
    for (const [gas, f] of Object.entries(conocimiento.base.factores_conversion)) {
      const t = porClave[`CONV-${gas}`];
      expect(cifras(t.texto).has(f.factor)).toBe(true);
      expect(t.titulo).toContain(f.de);
      expect(t.titulo).toContain(gas);
    }
  });

  it('el texto no trae saltos de línea ni espacios dobles', () => {
    for (const f of todos) expect(f.texto).not.toMatch(/\n| {2}/);
  });
});

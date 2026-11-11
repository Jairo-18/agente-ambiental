import {
  archivosInventados, describirProblemasCitas, extraerCitas, extraerNumeros, numerosPermitidos, verificar,
  verificarComparaciones, verificarConCitas, Rankings,
} from './verificador';

const ESTACIONES = ['Guaymaral', 'Kennedy', 'Puente Aranda'];
const RANKINGS: Rankings = {
  NO2: { alto: new Set(['Puente Aranda']), bajo: new Set(['Guaymaral']) },
  SO2: { alto: new Set(['Guaymaral']), bajo: new Set(['Kennedy']) },
  CO: { alto: new Set(['Kennedy']), bajo: new Set(['Guaymaral']) },
};
const HECHOS = {
  periodo: '2026-10', norma: 'Resolución 2254 de 2017',
  Kennedy: { PM10: { '24h': { limite_ugm3: 75, maximo: { valor_ugm3: 80.24, fecha_hora: '2026-10-28' }, n_excedencias: 1, representatividad_pct: 97.58 } } },
};
const PERMITIDOS = numerosPermitidos(HECHOS);
const tokens = (t: string) => extraerNumeros(t).map((n) => n.token);
const comp = (t: string, alcance = ['NO2', 'SO2', 'CO']) => verificarComparaciones(t, RANKINGS, ESTACIONES, alcance);

describe('cifras', () => {
  it('las etiquetas de contaminantes y unidades no son cifras', () => {
    expect(tokens('PM2.5, PM10, SO2, NO2 y O3 en µg/m³ y 24h')).toEqual([]);
  });

  it('cifras con punto, coma, fechas y porcentajes', () => {
    expect(tokens('80.24 y 80,24; el 28 de octubre; 2026-10-28; 97.58 %.')).toEqual(['80.24', '80,24', '28', '2026', '10', '28', '97.58']);
  });

  it('un número al final de la frase no arrastra el punto', () => {
    expect(tokens('excedió el límite de 75.')).toEqual(['75']);
  });

  it('un texto con solo cifras de los hechos pasa', () => {
    const v = verificar('En Kennedy el máximo de PM10 fue 80.24 µg/m³ el 28 de octubre, con límite de 75 µg/m³ en 24 h.', PERMITIDOS);
    expect(v).toMatchObject({ ok: true, inventadas: [], n_cifras: 4 }); // 80.24, 28, 75 y 24
  });

  it('una cifra inventada se detecta', () => {
    const v = verificar('El máximo de PM10 fue 81.5 µg/m³ y hubo 3 excedencias.', PERMITIDOS);
    expect(v.ok).toBe(false);
    expect(v.inventadas).toEqual(['81.5', '3']);
  });

  it('redondear cuenta como cifra nueva', () => {
    expect(verificar('El máximo fue 80.2 µg/m³.', PERMITIDOS).inventadas).toEqual(['80.2']);
    expect(verificar('El máximo fue 80 µg/m³.', PERMITIDOS).inventadas).toEqual(['80']);
  });

  it('la coma decimal equivale al punto', () => {
    expect(verificar('El máximo fue 80,24 µg/m³.', PERMITIDOS).ok).toBe(true);
  });

  it('la clave 24h permite el 24', () => {
    expect(verificar('promedio de 24 horas', PERMITIDOS).ok).toBe(true);
    expect(verificar('promedio de 12 horas', PERMITIDOS).ok).toBe(false);
  });

  it('los exigidos ausentes hacen fallar aunque las cifras estén bien', () => {
    const v = verificar('El máximo de PM10 fue 80.24 µg/m³.', PERMITIDOS, ['Kennedy']);
    expect(v).toMatchObject({ ok: false, faltan: ['Kennedy'], inventadas: [] });
    expect(verificar('En kennedy: 80.24', PERMITIDOS, ['Kennedy']).ok).toBe(true); // sin distinguir mayúsculas
  });

  it('bool, null y NaN no agregan números', () => {
    expect(numerosPermitidos({ a: true, b: null, c: NaN }).size).toBe(0);
  });
});

describe('comparaciones entre estaciones', () => {
  it('el error real de la primera corrida se detecta: cifras correctas pero ranking falso', () => {
    const frase = 'Guaymaral registró los valores más altos para SO2 (42.42 µg/m³) y NO2 (93.08 µg/m³), sin excedencias.';
    expect(verificar(frase, numerosPermitidos({ a: 42.42, b: 93.08 })).ok).toBe(true); // el verificador de cifras no lo ve
    const problemas = comp(frase);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain('NO2');
  });

  it('el segundo error real se cuela por frase pero no por cláusula', () => {
    const texto =
      'Kennedy registró las mayores concentraciones de CO, con una media de 1195.17 µg/m³, mientras que Puente Aranda tuvo ' +
      'la media más alta de NO2 y Guaymaral la más alta de CO con 453.26 µg/m³.';
    const problemas = comp(texto);
    expect(problemas.length).toBeGreaterThan(0);
    expect(problemas.some((p) => p.includes('CO'))).toBe(true);
  });

  it('cláusulas correctas separadas por "mientras que" pasan', () => {
    expect(comp('Puente Aranda tuvo la media más alta de NO2, mientras que Guaymaral tuvo la más baja de NO2.')).toEqual([]);
  });

  it('una comparación correcta pasa', () => {
    expect(comp('Puente Aranda tuvo el NO2 más alto y Guaymaral el más bajo.')).toEqual([]);
    expect(comp('Guaymaral registró el SO2 más alto.')).toEqual([]);
    expect(comp('Kennedy presentó el mayor valor de CO.')).toEqual([]);
  });

  it('una comparación con la estación equivocada se rechaza', () => {
    expect(comp('Kennedy tuvo el NO2 más alto.').length).toBeGreaterThan(0);
    expect(comp('Guaymaral tuvo el CO mayor.').length).toBeGreaterThan(0);
    expect(comp('Kennedy tuvo el SO2 más alto, seguido de Guaymaral.')).toEqual([]); // nombra a la correcta
  });

  it('una frase sin comparación no se revisa', () => {
    expect(comp('Kennedy tuvo un máximo diario de 80.24 µg/m³ el 28 de octubre.')).toEqual([]);
    expect(comp('Guaymaral cumple el límite de NO2.')).toEqual([]);
  });

  it('sin contaminante en la frase se usa el alcance', () => {
    expect(comp('Kennedy tuvo la media más alta.', ['CO'])).toEqual([]);
    expect(comp('Kennedy tuvo la media más alta.', ['NO2']).length).toBeGreaterThan(0);
  });

  it('un contaminante sin ranking no admite comparaciones', () => {
    expect(comp('Kennedy tuvo el O3 más alto.').length).toBeGreaterThan(0);
  });
});

describe('citas de fragmentos', () => {
  const FUENTES = [
    'El nivel máximo permisible de PM10 para un promedio de 24 horas es 75 µg/m³. Antes del 2018-07-01 era 100 µg/m³.',
    '¿Cuál es el límite de PM10 en 24 horas?',
  ];
  const CLAVES = ['LIM-PM10-24H', 'LIM-PM25-24H'];

  it('lee las claves entre corchetes', () => {
    expect(extraerCitas('Es 75 [LIM-PM10-24H] y 37 [LIM-PM25-24H].')).toEqual(['LIM-PM10-24H', 'LIM-PM25-24H']);
    expect(extraerCitas('sin citas')).toEqual([]);
  });

  it('acepta cifras de los fragmentos o de la pregunta, con citas válidas', () => {
    const v = verificarConCitas('El límite de PM10 en 24 horas es 75 µg/m³ [LIM-PM10-24H]; antes era 100 µg/m³ [LIM-PM10-24H].', FUENTES, CLAVES);
    expect(v).toEqual({ ok: true, cifrasInventadas: [], citasInexistentes: [], sinCitas: false });
  });

  it('rechaza una cifra que no está en los fragmentos', () => {
    const v = verificarConCitas('El límite es 80 µg/m³ [LIM-PM10-24H].', FUENTES, CLAVES);
    expect(v.ok).toBe(false);
    expect(v.cifrasInventadas).toEqual(['80']);
  });

  it('las cifras de las claves citadas no se confunden con cifras de la respuesta', () => {
    expect(verificarConCitas('Vale 75 µg/m³ [LIM-PM10-24H].', ['vale 75'], ['LIM-PM10-24H']).ok).toBe(true);
  });

  it('rechaza una cita a un fragmento que no se recuperó, y exige al menos una', () => {
    const v = verificarConCitas('Es 75 µg/m³ [LIM-SO2-24H].', FUENTES, CLAVES);
    expect(v.ok).toBe(false);
    expect(v.citasInexistentes).toEqual(['LIM-SO2-24H']);
    expect(verificarConCitas('El límite es 75 µg/m³.', FUENTES, CLAVES).sinCitas).toBe(true);
  });

  it('describe los problemas para realimentar al modelo', () => {
    const texto = describirProblemasCitas(verificarConCitas('Son 99 [FALSA].', FUENTES, CLAVES));
    expect(texto).toContain('99');
    expect(texto).toContain('FALSA');
  });
});

describe('nombres de archivo', () => {
  const fuentes = ['{"archivos": [{"archivo": "rmcab_2026-10_largo.csv"}]}'];

  it('un nombre inventado se detecta (regresión: "rmcab_10_largo.csv")', () => {
    expect(archivosInventados('Usa rmcab_2026-10_largo.csv y reporte.docx', fuentes)).toEqual([]);
    expect(archivosInventados('Usa rmcab_10_largo.csv', fuentes)).toEqual(['rmcab_10_largo.csv']);
    expect(archivosInventados('Sin archivos.', fuentes)).toEqual([]);
  });
});

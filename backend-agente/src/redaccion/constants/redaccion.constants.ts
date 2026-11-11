/** Secciones interpretativas del reporte -> contaminantes que cubre (null = todos). */
export const SECCIONES: Record<string, readonly string[] | null> = {
  resumen: null,
  comentario_pm10: ['PM10'],
  comentario_pm25: ['PM2.5'],
  comentario_gases: ['O3', 'SO2', 'NO2', 'CO'],
  conclusiones: null,
};

/**
 * Secciones donde el modelo puede redactar la parte descriptiva. El resumen y las conclusiones abarcan todos los
 * contaminantes y estaciones en frases largas, y ahí el modelo cometió afirmaciones falsas que el verificador por
 * frase no detectó (p. ej. "Guaymaral con el CO más alto" teniendo el más bajo): se dejan en plantilla.
 */
export const SECCIONES_CON_LLM = ['comentario_pm10', 'comentario_pm25', 'comentario_gases'] as const;

/** El modelo solo describe concentraciones. Excedencias, niveles y series no evaluables los escribe el código. */
export const GUIA: Record<string, string> = {
  resumen:
    'Escribe 2 o 3 frases (40 a 70 palabras) que caractericen los niveles de contaminación del mes: qué contaminantes y ' +
    'estaciones tuvieron los valores más altos, con sus cifras.',
  comentario_pm10:
    'Escribe un párrafo de 40 a 80 palabras sobre las concentraciones de PM10: qué estación tuvo la media mensual más alta y ' +
    'la más baja y cuál tuvo el máximo diario más alto, con cifras.',
  comentario_pm25:
    'Escribe un párrafo de 40 a 80 palabras sobre las concentraciones de PM2.5: qué estación tuvo la media mensual más alta y ' +
    'la más baja y cuál tuvo el máximo diario más alto, con cifras.',
  comentario_gases:
    'Escribe un párrafo de 60 a 100 palabras sobre las concentraciones de O3, SO2, NO2 y CO: para cada gas, qué estación tuvo ' +
    'la media mensual más alta, con sus cifras.',
  conclusiones:
    'Escribe 2 o 3 frases (40 a 70 palabras) que sinteticen dónde se concentraron los valores más altos de cada ' +
    'contaminante, con cifras. No hagas recomendaciones.',
};

export const SISTEMA_REDACTOR = `Eres redactor técnico de informes mensuales de calidad del aire de Bogotá. Reglas estrictas:
1. Usa SOLO las cifras del bloque HECHOS. Cópialas exactamente, con el mismo número de decimales y punto decimal (80.24, no 80,2 ni 80).
2. No redondees, no sumes, no calcules porcentajes ni diferencias nuevas, no escribas números con letras.
3. No inventes causas, fuentes de contaminación, efectos en la salud ni recomendaciones.
4. Describe solo concentraciones. NO hables de límites, normas, excedencias, cumplimiento, niveles de prevención o alerta, ni de si una serie se evaluó o no: eso lo agrega el sistema por separado.
5. Solo compares estaciones ("más alto", "mayor", "más bajo", "menor") con lo que dice ranking_entre_estaciones; no deduzcas comparaciones por tu cuenta. Si no hay ranking para algo, no lo compares.
6. Escribe en español formal, en un solo párrafo, sin listas, sin títulos y sin viñetas.
7. Responde únicamente con el párrafo.`;

/** Palabras que el modelo no puede usar: las afirmaciones normativas las escribe el código. */
export const PROHIBIDAS = /excedenc|exced[eií]|límite|limite|cumpl|evaluab|evaluad|evalu[óo]|indicativ|prevenci|alerta|emergencia|norma|resoluci/gi;

export const MAX_INTENTOS_REDACCION = 3;

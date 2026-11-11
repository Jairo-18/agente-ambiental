/** Constantes del dominio: contaminantes criterio, promedios de corto plazo, niveles de la Tabla 4, nombres de meses. */
export const CONTAMINANTES = ['PM10', 'PM2.5', 'SO2', 'NO2', 'O3', 'CO'] as const;
export type Contaminante = (typeof CONTAMINANTES)[number];

/** Un informe mensual solo evalúa promedios de corto plazo: el límite anual no se puede evaluar con un mes. */
export const PROMEDIOS_CORTOS = ['1h', '8h', '24h'] as const;
export type PromedioCorto = (typeof PROMEDIOS_CORTOS)[number];

/** Niveles de la Tabla 4 de la Res. 2254/2017, de menor a mayor. */
export const NIVELES = ['prevencion', 'alerta', 'emergencia'] as const;
export type Nivel = (typeof NIVELES)[number];
export const TEXTO_NIVEL: Record<Nivel, string> = { prevencion: 'prevención', alerta: 'alerta', emergencia: 'emergencia' };

export const PERIODO_REGEX = /^(19|20)\d\d-(0[1-9]|1[0-2])$/;

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Archivos que se pueden descargar de un reporte (lista cerrada: nunca una ruta arbitraria). */
export const ARCHIVOS_DEL_REPORTE: Record<string, string> = {
  'reporte.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'trazabilidad.md': 'text/plain; charset=utf-8',
  'hechos.json': 'application/json; charset=utf-8',
  'pm10_diario.png': 'image/png',
  'pm25_diario.png': 'image/png',
  'gases_medias.png': 'image/png',
};

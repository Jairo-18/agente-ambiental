import { ExcedenciaDetalle, NivelDetalle } from '../../shared/interfaces/detalle-reporte.interface';

/** Resultado de revisar un archivo para un mes (no escribe nada). */
export interface Revision {
  periodo: string;
  estaciones: string[];
  horas_esperadas: number;
  n_advertencias_por_severidad: { error: number; aviso: number; info: number };
  advertencias: string[];
  advertencias_omitidas: number;
  representatividad_pct: Record<string, Record<string, number | null>>;
  series_no_evaluables: { estacion: string; contaminante: string; representatividad_pct: number | null }[];
  minimo_para_evaluar_pct: number;
}

/** Lo que devuelve generar un reporte (lo usa la interfaz y el agente). */
export interface ResultadoGeneracion {
  generado: true;
  periodo: string;
  carpeta: string;
  archivo: 'reporte.docx';
  estaciones: string[];
  excedencias: Omit<ExcedenciaDetalle, 'regla_id'>[];
  niveles_excepcionales: Omit<NivelDetalle, 'regla_id'>[];
  series_no_evaluables: { estacion: string; contaminante: string; representatividad_pct: number | null }[];
  /** Quién escribió cada texto: 'llm' o 'plantilla'. */
  redaccion: Record<string, string>;
  /** El resumen escrito por el código: es lo que se le cuenta al usuario sobre el reporte. */
  texto_usuario: string;
  reporteId: number;
}

export interface OpcionesGeneracion {
  archivo: string;
  periodo: string;
  conLlm: boolean;
  /** Fecha en que se descargaron los datos (se declara en las limitaciones del informe). */
  descarga?: string;
}

/** Una versión guardada de un reporte, con los nombres de campo que consume el frontend. */
export interface VersionReporte {
  id: number;
  generado_en: Date;
  archivo_datos: string;
  con_llm: boolean | null;
  origen: string;
  n_excedencias: number;
}

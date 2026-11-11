/** Un reporte tal como lo muestra la interfaz (se guarda en `Reporte.detalle` y se arma desde `hechos.json`). */
export interface DetalleReporte {
  periodo: string;
  mes: string;
  estaciones: string[];
  resumen: string;
  filas: FilaSerie[];
  excedencias: ExcedenciaDetalle[];
  niveles: NivelDetalle[];
  no_evaluables: { estacion: string; contaminante: string; representatividad_pct: number }[];
  advertencias: { codigo: string; severidad: string; mensaje: string; estacion?: string | null; variable?: string | null; cantidad?: number | null }[];
  archivos: string[];
}

export interface FilaSerie {
  estacion: string;
  contaminante: string;
  representatividad: number;
  evaluable: boolean;
  media: number | null;
  maximos: { promedio: string; valor: number; fecha: string; limite: number | null }[];
  excedencias: number;
}

export interface ExcedenciaDetalle {
  estacion: string;
  contaminante: string;
  promedio: string;
  fecha_hora: string;
  valor_ugm3: number;
  limite_ugm3: number;
  regla_id: string;
}

export interface NivelDetalle {
  estacion: string;
  contaminante: string;
  promedio: string;
  fecha_hora: string;
  valor_ugm3: number;
  nivel: string;
  regla_id: string;
}

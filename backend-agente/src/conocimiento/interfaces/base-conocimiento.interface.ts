/** La base de conocimiento de la norma (`knowledge/aire_res2254_2017.yaml`). Solo datos: aquí no hay lógica. */

export interface ContaminanteBase {
  nombre: string;
  nombres_rmcab: string[];
  unidad_norma: string;
  unidad_rmcab?: string;
}

export interface Limite {
  id: string;
  contaminante: string;
  promedio: string;
  limite: number;
  limite_inicial?: number;
  fuente: string;
}

/** [mínimo, máximo] en µg/m³; `null` = sin tope superior. */
export type Rango = [number, number | null];

export interface NivelExcepcional {
  contaminante: string;
  promedio: string;
  prevencion: Rango;
  alerta: Rango;
  emergencia: Rango;
}

export interface CategoriaIca {
  rango: [number, number];
  color: string;
  estado: string;
  efectos: string;
}

export interface FactorConversion {
  de: 'ppb' | 'ppm';
  factor: number;
  masa_molar: number;
}

export interface BaseConocimiento {
  norma: {
    nombre: string;
    emisor: string;
    expedicion: string;
    diario_oficial: string;
    vigencia_desde: string;
    deroga: string[];
    estado_verificado: { fecha: string; evidencia: string };
  };
  contaminantes: Record<string, ContaminanteBase>;
  limites: Limite[];
  criterios_evaluacion: { por_punto_de_monitoreo: boolean; fuente: string };
  metas_2030: Limite[];
  niveles_excepcionales: NivelExcepcional[];
  niveles_excepcionales_fuente: string;
  toxicos: { contaminante: string; limite: number; promedio: string }[];
  ica_categorias: CategoriaIca[];
  ica_categorias_fuente: string;
  informes: { periodicidad_minima: string[]; incluir_evaluacion_de_eventos_atipicos: boolean; fuente: string };
  condiciones_referencia: { temperatura_c: number; presion_mmhg: number; verificado: boolean; fuente: string };
  factores_conversion: Record<string, FactorConversion>;
  factores_conversion_fuente: string;
  datos_validos: { representatividad_temporal_minima_pct: number; si_no_cumple: string; fuente: string };
  validez_promedios: {
    verificado: boolean;
    fuente: string;
    min_horas: Record<string, number>;
    ventanas: Record<string, string>;
  };
  evaluacion_informe_mensual: { promedios_evaluables: string[]; promedios_no_evaluables: string[] };
  pendientes: string[];
}

export interface EstacionReferencia {
  sigla: string;
  latitud: string;
  longitud: string;
  altitud_m: number;
  localidad: string;
  tipo_zona: string;
  tipo_estacion: string;
  direccion: string;
}

/** Variable meteorológica "canónica": cómo se llama en los datos de la RMCAB (el orden decide cuál se usa). */
export interface VariableCanonica {
  nombres_rmcab: string[];
  unidad: string;
}

import { Nivel } from '../../shared/constants/aire.constants';
import { FilaLimpia } from '../../datos/interfaces/fila.interface';

export type Severidad = 'info' | 'aviso' | 'error';

/** Todo lo que el QA/QC excluye o sospecha se avisa: nada se corrige ni se descarta en silencio. */
export interface Advertencia {
  codigo: string;
  severidad: Severidad;
  mensaje: string;
  estacion: string | null;
  variable: string | null;
  cantidad: number | null;
}

export interface ResultadoQaqc {
  datos: FilaLimpia[];
  advertencias: Advertencia[];
}

/** Un promedio de corto plazo en el instante `t` (fin de la ventana; para 24 h, la medianoche del día). */
export interface Punto {
  t: number;
  valor: number;
}

// ---------------------------------------------------------------- hechos.json: todo lo que el reporte puede afirmar

export interface MaximoHechos {
  valor_ugm3: number;
  fecha_hora: string;
  conclusion: string;
}

export interface ExcedenciaHechos {
  regla_id: string;
  fecha_hora: string;
  valor_ugm3: number;
  limite_ugm3: number;
}

export interface NivelHechos {
  nivel: Nivel;
  fecha_hora: string;
  valor_ugm3: number;
  regla_id: string;
}

export interface PromedioHechos {
  regla_limite: string;
  limite_ugm3: number;
  n_promedios_validos: number;
  maximo: MaximoHechos | null;
  excedencias: ExcedenciaHechos[];
  n_excedencias: number;
  niveles_excepcionales: NivelHechos[];
  cumple: boolean | null;
  /** Solo en series no evaluables: valores informativos que no entran en las conclusiones. */
  indicativo?: { maximo: MaximoHechos; n_excedencias: number };
}

export type ContaminanteHechos =
  | { disponible: false }
  | {
      disponible: true;
      n_validos: number;
      n_esperados: number;
      representatividad_pct: number | null;
      evaluable: boolean;
      media_mensual_ugm3: number | null;
      promedios: Record<string, PromedioHechos>;
    };

export interface MeteoVariable {
  disponible: boolean;
  variable_origen?: string;
  unidad_origen?: string | null;
  representatividad_pct?: number | null;
  total_mm?: number | null;
  dias_con_lluvia?: number;
  media_c?: number | null;
  minima_c?: number | null;
  maxima_c?: number | null;
  media_ms?: number | null;
  maxima_ms?: number | null;
}

export interface EstacionHechos {
  contaminantes: Record<string, ContaminanteHechos>;
  meteorologia: { precipitacion: MeteoVariable; temperatura: MeteoVariable; viento_velocidad: MeteoVariable };
}

export interface Hechos {
  meta: {
    periodo: string;
    n_esperados: number;
    esquema: string;
    norma: string;
    datos_preliminares: boolean;
    representatividad_minima_pct: number;
    contaminantes: string[];
    supuestos: string[];
    definiciones_meteorologia: string[];
  };
  estaciones: Record<string, EstacionHechos>;
  resumen: {
    excedencias_por_contaminante: Record<string, Record<string, { n_excedencias: number; estaciones: string[] }>>;
    estaciones_no_evaluables: { estacion: string; contaminante: string; representatividad_pct: number | null }[];
  };
  advertencias: Advertencia[];
}

export interface ResultadoAnalisis {
  hechos: Hechos;
  /** Datos limpios por el QA/QC (los gráficos los necesitan). */
  datos: FilaLimpia[];
}

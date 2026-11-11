/** Forma de `knowledge/reportes_ciudadanos_bogota.yaml` (ver los comentarios del YAML). */

export const TIPOS_REPORTE = ['residuos', 'arbolado', 'quema', 'ruido', 'aire', 'agua', 'otro'] as const;
export type TipoReporte = (typeof TIPOS_REPORTE)[number];

export interface CanalOficial {
  nombre: string;
  /** Para decirlo en una frase (y en voz alta): a quién y el número. */
  corto: string;
  detalle: string;
  fuente: string;
  verificado: boolean;
}

export interface TipoReporteInfo {
  nombre: string;
  palabras: string[];
  /** Pistas que deciden el tipo aunque haya otras (valen 3): p. ej. un cuerpo de agua. */
  palabras_fuertes?: string[];
  entidad: string;
  canales: string[];
  normas: string[];
  datos_a_pedir: string[];
  prioridad_base: number;
}

export interface Modificador {
  puntos: number;
  emergencia?: boolean;
  descripcion?: string;
  palabras?: string[];
}

export interface NormaReporte {
  clave: string;
  titulo: string;
  texto: string;
  fuente: string;
  verificado: boolean;
}

export interface BaseReportesCiudadanos {
  version: number;
  consultado: string;
  territorio: string;
  autoridad_ambiental: string;
  aviso_radicado: string;
  canales: Record<string, CanalOficial>;
  tipos: Record<TipoReporte, TipoReporteInfo>;
  reglas_prioridad: {
    verificado: boolean;
    fuente: string;
    umbrales: { alta: number; media: number };
    modificadores: Record<'peligro' | 'en_curso' | 'receptor_sensible' | 'recurrente' | 'nocturno_ruido', Modificador>;
  };
  normas: NormaReporte[];
  localidades: string[];
}

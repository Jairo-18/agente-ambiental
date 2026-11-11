/** Formato estándar de entrada (una fila por medición): estacion, fecha_hora, variable, valor, unidad. */
export interface FilaLarga {
  estacion: string;
  /** Instante FINAL del periodo horario, 'AAAA-MM-DD HH:MM:SS' (01:00 = promedio de 00:01 a 01:00). */
  fecha_hora: string;
  variable: string;
  /** Tal como llegó: el QA/QC cuenta y avisa lo que no sea numérico. Vacío = dato faltante. */
  valor: string | number | null;
  unidad: string | null;
}

/** Fila ya validada por el QA/QC: fecha como milisegundos UTC y valor numérico (NaN = faltante). */
export interface FilaLimpia {
  estacion: string;
  variable: string;
  unidad: string | null;
  t: number;
  valor: number;
}

export interface ArchivoDatos {
  archivo: string;
  desde?: string;
  hasta?: string;
  estaciones?: string[];
  aviso?: string;
}

export const COLUMNAS_OBLIGATORIAS = ['estacion', 'fecha_hora', 'variable', 'valor', 'unidad'] as const;

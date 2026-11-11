import { Nivel } from '../../shared/constants/aire.constants';

export interface Regla {
  id: string;
  tipo: 'limite' | 'nivel';
  contaminante: string;
  promedio: string;
  fuente: string;
  limite?: number;
  nivel?: Nivel;
  minimo?: number;
  maximo?: number | null;
}

export type EstadoEvaluacion = 'cumple' | 'excede' | 'sin_regla' | 'sin_dato';

/** Lo que devuelve el motor: conclusión, reglas que se dispararon, fuentes y la explicación paso a paso. */
export interface Resultado {
  contaminante: string;
  promedio: string;
  valor: number;
  unidad: string;
  valor_ugm3: number;
  estado: EstadoEvaluacion;
  nivel_excepcional: Nivel | null;
  conclusion: string;
  reglas: string[];
  fuentes: string[];
  explicacion: string[];
}

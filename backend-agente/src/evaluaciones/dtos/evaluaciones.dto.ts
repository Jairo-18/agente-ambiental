import { IsIn, IsNumber, IsOptional } from 'class-validator';
import { CONTAMINANTES } from '../../shared/constants/aire.constants';

export const PROMEDIOS_EVALUABLES = ['1h', '8h', '24h'] as const;
export const UNIDADES_ENTRADA = ['µg/m3', 'ppb', 'ppm'] as const;

export class EvaluarDto {
  @IsIn(CONTAMINANTES)
  contaminante!: string;

  @IsIn(PROMEDIOS_EVALUABLES)
  promedio!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  valor!: number;

  @IsOptional()
  @IsIn(UNIDADES_ENTRADA)
  unidad?: string;
}

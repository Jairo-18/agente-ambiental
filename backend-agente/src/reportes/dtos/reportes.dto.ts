import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PERIODO_REGEX } from '../../shared/constants/aire.constants';

export class RevisarDto {
  @IsString()
  @MaxLength(200)
  archivo!: string;

  @Matches(PERIODO_REGEX, { message: 'El periodo debe tener el formato AAAA-MM' })
  periodo!: string;
}

export class GenerarDto extends RevisarDto {
  /** Que el modelo redacte los comentarios (más lento). Por defecto sí; si no, salen de plantilla. */
  @IsOptional()
  @IsBoolean()
  conLlm?: boolean;

  /** Confirmación explícita de quien llama para generar otra versión de un mes que ya tiene reporte. */
  @IsOptional()
  @IsBoolean()
  confirmado?: boolean;
}

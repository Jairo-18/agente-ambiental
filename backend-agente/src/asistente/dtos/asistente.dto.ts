import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class MensajeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  mensaje!: string;

  /** Evidencias subidas antes con POST /chat/adjuntos o /chat/voz/transcribir (fotos, notas de voz). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  adjuntoIds?: string[];

  /** 'voz' si el ciudadano dictó el mensaje con el micrófono (queda como canal del reporte). */
  @IsOptional()
  @IsIn(['texto', 'voz'])
  canal?: 'texto' | 'voz';
}

export class ConfirmarDto {
  @IsString()
  id!: string;

  @IsBoolean()
  ok!: boolean;
}

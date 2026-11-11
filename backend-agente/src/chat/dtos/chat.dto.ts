import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Esfuerzo, ESFUERZOS, PROVEEDORES, ProveedorId } from '../../llm/interfaces/chat.interface';

export class EnviarChatDto {
  @ApiPropertyOptional({ description: 'Conversación a continuar; sin él se crea una nueva' })
  @IsOptional()
  @IsUUID()
  conversacionId?: string;

  @ApiProperty({ enum: PROVEEDORES })
  @IsIn(PROVEEDORES)
  proveedor!: ProveedorId;

  @ApiProperty({ example: 'qwen2.5:14b' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  modelo!: string;

  @ApiPropertyOptional({ enum: ESFUERZOS, description: 'Capacidad: cuánto razona el modelo. Sin él, el valor por defecto del modelo' })
  @IsOptional()
  @IsIn(ESFUERZOS)
  esfuerzo?: Esfuerzo;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  mensaje!: string;

  @ApiPropertyOptional({ type: [String], description: 'Archivos subidos antes con POST /chat/adjuntos o /chat/voz/transcribir' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  adjuntoIds?: string[];

  @ApiPropertyOptional({ description: 'Instrucciones extra para el modelo (se suman al mensaje de sistema)' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instrucciones?: string;
}

export class BuscarMemoriaDto {
  @ApiProperty({ description: 'Qué buscar (por significado, no por palabras exactas)' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  q!: string;

  @ApiPropertyOptional({ description: 'Solo en los archivos de esta conversación' })
  @IsOptional()
  @IsUUID()
  conversacionId?: string;
}

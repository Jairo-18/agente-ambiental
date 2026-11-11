import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { TIPOS_REPORTE } from '../../conocimiento/interfaces/reportes-ciudadanos.interface';
import { ESTADOS_REPORTE } from '../../shared/entities/reporteCiudadano.entity';

export class ReporteCiudadanoDto {
  @ApiProperty({ example: 'Están quemando basura en el lote de la esquina, hay mucho humo' })
  @IsString()
  @MinLength(8)
  @MaxLength(3000)
  descripcion!: string;

  @ApiProperty({ example: 'Calle 38 sur con carrera 80, frente al parque' })
  @IsString()
  @MinLength(3)
  @MaxLength(250)
  direccion!: string;

  @ApiPropertyOptional({ example: 'Kennedy' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  localidad?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  barrio?: string;

  @ApiPropertyOptional({ example: 'ahora mismo' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  cuando?: string;

  @ApiProperty()
  @IsBoolean()
  enCurso!: boolean;

  @ApiPropertyOptional({ enum: TIPOS_REPORTE, description: 'Tipo propuesto; el sistema lo contrasta con sus reglas' })
  @IsOptional()
  @IsIn(TIPOS_REPORTE)
  tipo?: string;

  @ApiPropertyOptional({ description: 'Nombre o teléfono (opcional: el reporte puede ser anónimo)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contacto?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(3.7)
  @Max(5)
  latitud?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-74.5)
  @Max(-73.9)
  longitud?: number;

  @ApiPropertyOptional({ type: [String], description: 'Evidencias subidas con POST /chat/adjuntos (fotos, audios)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  evidenciaIds?: string[];
}

export class CambioEstadoDto {
  @ApiProperty({ enum: ESTADOS_REPORTE })
  @IsIn(ESTADOS_REPORTE)
  estado!: (typeof ESTADOS_REPORTE)[number];

  @ApiPropertyOptional({ example: 'Remitido a la SDA, área de flora, por correo.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  nota?: string;
}

export class FiltrosReportesDto {
  @IsOptional() @IsIn(TIPOS_REPORTE) tipo?: string;
  @IsOptional() @IsIn(ESTADOS_REPORTE) estado?: string;
  @IsOptional() @IsIn(['alta', 'media', 'baja']) prioridad?: string;
  @IsOptional() @IsString() @MaxLength(40) localidad?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limite?: number;
}

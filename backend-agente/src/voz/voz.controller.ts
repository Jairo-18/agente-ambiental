import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { VozService } from '../llm/services/voz.service';

export class HablarDto {
  @ApiProperty({ example: 'Listo, registré tu reporte con el radicado RA-2026-00012.' })
  @IsString()
  @MinLength(1)
  @MaxLength(6000)
  texto!: string;

  @ApiPropertyOptional({ example: 'ef_dora' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  voz?: string;
}

/** Voz del sistema: reconocimiento (Whisper) y síntesis (Kokoro), ambos locales en el contenedor `stt`. */
@Controller('voz')
@ApiTags('Voz')
export class VozController {
  constructor(private readonly voz: VozService) {}

  @Get()
  @ApiOperation({ summary: 'Estado del reconocimiento de voz y voces disponibles para leer respuestas' })
  async estado() {
    return { stt: await this.voz.estado(), tts: this.voz.voces() };
  }

  @Post('hablar')
  @ApiOperation({ summary: 'Lee un texto en voz alta (MP3, Kokoro local); el texto se limpia de Markdown y unidades antes' })
  async hablar(@Body() dto: HablarDto, @Res() res: Response) {
    const audio = await this.voz.hablar(dto.texto, dto.voz);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.end(audio);
  }
}

import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ConfirmarDto, MensajeDto } from '../dtos/asistente.dto';
import { AsistenteUC } from '../useCases/asistente.uc';

@Controller('asistente')
@ApiTags('Asistente')
export class AsistenteController {
  constructor(private readonly uc: AsistenteUC) {}

  @Post('mensajes')
  @ApiOperation({ summary: 'Envía un mensaje al agente; responde 202 con el id del trabajo (puede incluir generar un reporte)' })
  mensaje(@Body() dto: MensajeDto, @Res({ passthrough: true }) res: Response) {
    res.status(202);
    return this.uc.enviar(dto.mensaje.trim(), dto.adjuntoIds ?? [], dto.canal ?? 'texto');
  }

  @Get('historial')
  @ApiOperation({ summary: 'Mensajes de la conversación vigente' })
  historial() {
    return this.uc.historial();
  }

  @Get('pendiente')
  @ApiOperation({ summary: 'Confirmación que el agente espera de una persona (sobrescribir un reporte), si la hay' })
  pendiente() {
    return this.uc.pendiente();
  }

  @Post('confirmar')
  @ApiOperation({ summary: 'Responde la confirmación pendiente' })
  confirmar(@Body() dto: ConfirmarDto) {
    return this.uc.confirmar(dto.id, dto.ok);
  }

  @Post('nueva')
  @ApiOperation({ summary: 'Empieza una conversación nueva' })
  nueva() {
    return this.uc.nueva();
  }
}

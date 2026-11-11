import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EvaluarDto } from '../dtos/evaluaciones.dto';
import { EvaluacionesService } from '../services/evaluaciones.service';

@Controller('evaluaciones')
@ApiTags('Evaluaciones')
export class EvaluacionesController {
  constructor(private readonly evaluaciones: EvaluacionesService) {}

  @Post()
  @ApiOperation({ summary: 'Evalúa un valor ya promediado contra la Res. 2254/2017, con regla, fuente y pasos' })
  evaluar(@Body() dto: EvaluarDto) {
    return this.evaluaciones.evaluar(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Últimas evaluaciones (registro de auditoría)' })
  historial(@Query('limite') limite?: string) {
    return this.evaluaciones.historial(Math.min(Math.max(parseInt(limite ?? '10', 10) || 10, 1), 100));
  }
}

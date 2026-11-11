import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TrabajosService } from '../services/trabajos.service';

@Controller('trabajos')
@ApiTags('Trabajos en segundo plano')
export class TrabajosController {
  constructor(private readonly trabajos: TrabajosService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Estado de una operación larga (generar reporte, chat): en_curso, listo o error' })
  obtener(@Param('id') id: string) {
    return this.trabajos.obtener(id);
  }
}

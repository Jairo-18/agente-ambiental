import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CambioEstadoDto, FiltrosReportesDto, ReporteCiudadanoDto } from '../dtos/reportes-ciudadanos.dto';
import { ReportesCiudadanosUC } from '../useCases/reportes-ciudadanos.uc';

@Controller('reportes-ciudadanos')
@ApiTags('Reportes ciudadanos')
export class ReportesCiudadanosController {
  constructor(private readonly uc: ReportesCiudadanosUC) {}

  @Get()
  @ApiOperation({ summary: 'Reportes ciudadanos (filtros: tipo, estado, prioridad, localidad), los más recientes primero' })
  listar(@Query() f: FiltrosReportesDto) {
    return this.uc.listar(f);
  }

  @Get('estadisticas')
  @ApiOperation({ summary: 'Conteos por tipo, prioridad, estado y localidad' })
  estadisticas() {
    return this.uc.estadisticas();
  }

  @Get('catalogo')
  @ApiOperation({ summary: 'Tipos de reporte, localidades de Bogotá y estados posibles (para formularios)' })
  catalogo() {
    return this.uc.catalogo();
  }

  @Post('analizar')
  @ApiOperation({ summary: 'Clasifica, prioriza y enruta un reporte SIN guardarlo (reglas del YAML)' })
  analizar(@Body() dto: ReporteCiudadanoDto) {
    return this.uc.analizar(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Registra un reporte desde el formulario (el agente usa su herramienta, con confirmación)' })
  crear(@Body() dto: ReporteCiudadanoDto) {
    return this.uc.crear(dto);
  }

  @Get(':radicado')
  @ApiOperation({ summary: 'Un reporte con su historial y evidencias' })
  consultar(@Param('radicado') radicado: string) {
    return this.uc.consultar(radicado);
  }

  @Post(':radicado/estado')
  @ApiOperation({ summary: 'Cambia el estado de un reporte (funcionario); queda en el historial' })
  cambiarEstado(@Param('radicado') radicado: string, @Body() dto: CambioEstadoDto) {
    return this.uc.cambiarEstado(radicado, dto.estado, dto.nota);
  }
}

import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { GenerarDto, RevisarDto } from '../dtos/reportes.dto';
import { ReportesUC } from '../useCases/reportes.uc';

@Controller()
@ApiTags('Reportes')
export class ReportesController {
  constructor(private readonly uc: ReportesUC) {}

  @Get('datos')
  @ApiOperation({ summary: 'Archivos de datos disponibles, con su rango de fechas y estaciones' })
  datos() {
    return this.uc.archivosDeDatos();
  }

  @Post('reportes/revisar')
  @ApiOperation({ summary: 'QA/QC y representatividad de un archivo para un mes (no escribe nada)' })
  revisar(@Body() dto: RevisarDto) {
    return this.uc.revisar(dto);
  }

  @Post('reportes/generar')
  @ApiOperation({ summary: 'Genera el reporte mensual en segundo plano (202 + trabajoId) o pide confirmar si el mes ya tiene uno' })
  generar(@Body() dto: GenerarDto, @Res({ passthrough: true }) res: Response) {
    const r = this.uc.generar(dto);
    if ('trabajoId' in r) res.status(202);
    return r;
  }

  @Get('reportes')
  @ApiOperation({ summary: 'Último reporte de cada mes, con su número de versiones' })
  listar() {
    return this.uc.listar();
  }

  @Get('analitica')
  @ApiOperation({ summary: 'Resumen entre reportes (consultas SQL sobre la base)' })
  analitica() {
    return this.uc.analitica();
  }

  @Get('reportes/:periodo')
  @ApiOperation({ summary: 'Último reporte guardado de un mes' })
  ultimo(@Param('periodo') periodo: string) {
    return this.uc.ultimo(periodo);
  }

  @Get('reportes/:periodo/versiones')
  @ApiOperation({ summary: 'Todas las versiones guardadas de un mes' })
  versiones(@Param('periodo') periodo: string) {
    return this.uc.versiones(periodo);
  }

  /** DOCX, trazabilidad, hechos y gráficos: una lista cerrada de nombres, nunca una ruta. */
  @Get('reportes/:periodo/archivos/:nombre')
  @ApiOperation({ summary: 'Descarga un archivo del reporte (reporte.docx, trazabilidad.md, hechos.json, gráficos)' })
  archivo(@Param('periodo') periodo: string, @Param('nombre') nombre: string, @Res() res: Response) {
    const { ruta, tipo } = this.uc.archivo(periodo, nombre);
    res.setHeader('Content-Type', tipo);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (nombre.endsWith('.docx')) res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.sendFile(ruta);
  }
}

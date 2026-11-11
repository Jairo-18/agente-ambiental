import { Module } from '@nestjs/common';
import { AnalisisModule } from '../analisis/analisis.module';
import { ConocimientoModule } from '../conocimiento/conocimiento.module';
import { DatosModule } from '../datos/datos.module';
import { LlmModule } from '../llm/llm.module';
import { RedaccionModule } from '../redaccion/redaccion.module';
import { SharedModule } from '../shared/shared.module';
import { ReportesController } from './controllers/reportes.controller';
import { AlmacenReportesService } from './services/almacen-reportes.service';
import { DetalleReporteService } from './services/detalle-reporte.service';
import { GraficosService } from './services/graficos.service';
import { ReporteDocxService } from './services/reporte-docx.service';
import { ReportesService } from './services/reportes.service';
import { TrazabilidadService } from './services/trazabilidad.service';
import { ReportesUC } from './useCases/reportes.uc';

/** El reporte mensual de calidad del aire: generación (Word, gráficos, trazabilidad), almacenamiento y consulta. */
@Module({
  imports: [SharedModule, ConocimientoModule, DatosModule, AnalisisModule, RedaccionModule, LlmModule],
  controllers: [ReportesController],
  providers: [
    ReportesUC, ReportesService, GraficosService, ReporteDocxService, TrazabilidadService, AlmacenReportesService, DetalleReporteService,
  ],
  exports: [ReportesService, AlmacenReportesService],
})
export class ReportesModule {}

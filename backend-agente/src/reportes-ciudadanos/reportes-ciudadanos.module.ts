import { Module } from '@nestjs/common';
import { ConocimientoModule } from '../conocimiento/conocimiento.module';
import { LlmModule } from '../llm/llm.module';
import { SharedModule } from '../shared/shared.module';
import { ReportesCiudadanosController } from './controllers/reportes-ciudadanos.controller';
import { ClasificacionService } from './services/clasificacion.service';
import { ReportesCiudadanosService } from './services/reportes-ciudadanos.service';
import { ReportesCiudadanosUC } from './useCases/reportes-ciudadanos.uc';

/**
 * Reportes ciudadanos ambientales de Bogotá (basura, tala, quema, ruido, aire, agua): clasificación y prioridad por
 * reglas, radicado, evidencias, historial y duplicados por similitud (pgvector). El agente los crea con su herramienta.
 */
@Module({
  imports: [SharedModule, ConocimientoModule, LlmModule],
  controllers: [ReportesCiudadanosController],
  providers: [ReportesCiudadanosUC, ReportesCiudadanosService, ClasificacionService],
  exports: [ReportesCiudadanosService, ClasificacionService],
})
export class ReportesCiudadanosModule {}

import { Module } from '@nestjs/common';
import { ConocimientoModule } from '../conocimiento/conocimiento.module';
import { NormativaModule } from '../normativa/normativa.module';
import { EstadisticaService } from './services/estadistica.service';
import { HechosService } from './services/hechos.service';
import { QaqcService } from './services/qaqc.service';

/** De datos crudos a hechos: control de calidad (QA/QC), series y promedios, y evaluación contra la norma. */
@Module({
  imports: [ConocimientoModule, NormativaModule],
  providers: [QaqcService, EstadisticaService, HechosService],
  exports: [QaqcService, EstadisticaService, HechosService],
})
export class AnalisisModule {}

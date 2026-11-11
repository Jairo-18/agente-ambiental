import { Module } from '@nestjs/common';
import { NormativaModule } from '../normativa/normativa.module';
import { SharedModule } from '../shared/shared.module';
import { EvaluacionesController } from './controllers/evaluaciones.controller';
import { EvaluacionesService } from './services/evaluaciones.service';

/** "¿Este valor cumple la norma?": el motor de reglas con su registro de auditoría. */
@Module({
  imports: [SharedModule, NormativaModule],
  controllers: [EvaluacionesController],
  providers: [EvaluacionesService],
  exports: [EvaluacionesService],
})
export class EvaluacionesModule {}

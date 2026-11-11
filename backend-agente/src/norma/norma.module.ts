import { Module } from '@nestjs/common';
import { ConocimientoModule } from '../conocimiento/conocimiento.module';
import { LlmModule } from '../llm/llm.module';
import { SharedModule } from '../shared/shared.module';
import { NormaController } from './controllers/norma.controller';
import { NormaService } from './services/norma.service';
import { NormaUC } from './useCases/norma.uc';

/** Búsqueda vectorial (pgvector) de la Res. 2254/2017 y respuestas con citas verificadas. */
@Module({
  imports: [SharedModule, ConocimientoModule, LlmModule],
  controllers: [NormaController],
  providers: [NormaUC, NormaService],
  exports: [NormaService],
})
export class NormaModule {}

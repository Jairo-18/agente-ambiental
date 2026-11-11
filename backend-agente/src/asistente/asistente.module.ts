import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { ConocimientoModule } from '../conocimiento/conocimiento.module';
import { DatosModule } from '../datos/datos.module';
import { EvaluacionesModule } from '../evaluaciones/evaluaciones.module';
import { LlmModule } from '../llm/llm.module';
import { NormaModule } from '../norma/norma.module';
import { ReportesModule } from '../reportes/reportes.module';
import { ReportesCiudadanosModule } from '../reportes-ciudadanos/reportes-ciudadanos.module';
import { SharedModule } from '../shared/shared.module';
import { AsistenteController } from './controllers/asistente.controller';
import { AgenteService } from './services/agente.service';
import { ConfirmacionesService } from './services/confirmaciones.service';
import { HerramientasService } from './services/herramientas.service';
import { AsistenteUC } from './useCases/asistente.uc';

/** El agente conversacional: el modelo elige entre ocho herramientas fijas y todo lo que afirma sale de ellas. */
@Module({
  imports: [SharedModule, LlmModule, DatosModule, ReportesModule, EvaluacionesModule, NormaModule, ReportesCiudadanosModule, ChatModule, ConocimientoModule],
  controllers: [AsistenteController],
  providers: [AsistenteUC, AgenteService, HerramientasService, ConfirmacionesService],
})
export class AsistenteModule {}

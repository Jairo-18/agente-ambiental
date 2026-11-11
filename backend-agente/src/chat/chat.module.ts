import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { SharedModule } from '../shared/shared.module';
import { ChatController } from './controllers/chat.controller';
import { AdjuntosService } from './services/adjuntos.service';
import { ChatService } from './services/chat.service';
import { ContextoService } from './services/contexto.service';
import { ExtraccionService } from './services/extraccion.service';
import { MemoriaService } from './services/memoria.service';
import { ChatUC } from './useCases/chat.uc';

/**
 * Chat libre con el modelo que elija el usuario (Ollama local, DeepSeek por API, Claude con su suscripción), con voz
 * (Whisper local) y archivos guardados en PostgreSQL e indexados en pgvector.
 */
@Module({
  imports: [SharedModule, LlmModule],
  controllers: [ChatController],
  providers: [ChatUC, ChatService, ContextoService, AdjuntosService, ExtraccionService, MemoriaService],
  exports: [AdjuntosService, MemoriaService],
})
export class ChatModule {}

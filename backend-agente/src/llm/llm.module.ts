import { Module } from '@nestjs/common';
import { ClaudeCliService } from './services/claude-cli.service';
import { DeepseekService } from './services/deepseek.service';
import { OllamaChatService } from './services/ollama-chat.service';
import { OllamaService } from './services/ollama.service';
import { VozService } from './services/voz.service';

/** Acceso a los modelos: Ollama (local, el del agente) y, para el chat libre, DeepSeek, Claude y Whisper (voz). */
@Module({
  providers: [OllamaService, OllamaChatService, DeepseekService, ClaudeCliService, VozService],
  exports: [OllamaService, OllamaChatService, DeepseekService, ClaudeCliService, VozService],
})
export class LlmModule {}

import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { VozController } from './voz.controller';

/** STT y TTS por HTTP (la lógica vive en llm/services/voz.service.ts). */
@Module({ imports: [LlmModule], controllers: [VozController] })
export class VozModule {}

import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { SaludController } from './controllers/salud.controller';

@Module({ imports: [LlmModule], controllers: [SaludController] })
export class SaludModule {}

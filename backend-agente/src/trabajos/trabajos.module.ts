import { Global, Module } from '@nestjs/common';
import { TrabajosController } from './controllers/trabajos.controller';
import { TrabajosService } from './services/trabajos.service';

@Global()
@Module({ controllers: [TrabajosController], providers: [TrabajosService], exports: [TrabajosService] })
export class TrabajosModule {}

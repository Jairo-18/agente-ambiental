import { Module } from '@nestjs/common';
import { ConocimientoService } from './services/conocimiento.service';
import { FragmentosService } from './services/fragmentos.service';

/** La base de conocimiento de la norma (YAML) y su versión en fragmentos de texto para el buscador vectorial. */
@Module({
  providers: [ConocimientoService, FragmentosService],
  exports: [ConocimientoService, FragmentosService],
})
export class ConocimientoModule {}

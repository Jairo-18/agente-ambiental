import { Module } from '@nestjs/common';
import { PlantillasService } from './services/plantillas.service';
import { RedaccionService } from './services/redaccion.service';

/** Textos interpretativos del reporte: plantillas del código y prosa del modelo bajo verificación. */
@Module({
  providers: [PlantillasService, RedaccionService],
  exports: [PlantillasService, RedaccionService],
})
export class RedaccionModule {}

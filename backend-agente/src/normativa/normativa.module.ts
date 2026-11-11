import { Module } from '@nestjs/common';
import { ConocimientoModule } from '../conocimiento/conocimiento.module';
import { MotorReglasService } from './services/motor-reglas.service';
import { UnidadesService } from './services/unidades.service';

/** Aplicación de la norma: conversión de unidades y motor de reglas (cumple / excede / nivel excepcional). */
@Module({
  imports: [ConocimientoModule],
  providers: [UnidadesService, MotorReglasService],
  exports: [UnidadesService, MotorReglasService],
})
export class NormativaModule {}

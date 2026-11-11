import { Module } from '@nestjs/common';
import { DatosService } from './services/datos.service';
import { RmcabXlsxService } from './services/rmcab-xlsx.service';

/** Archivos de datos de entrada: CSV estándar y Excel de la RMCAB. */
@Module({
  providers: [DatosService, RmcabXlsxService],
  exports: [DatosService],
})
export class DatosModule {}

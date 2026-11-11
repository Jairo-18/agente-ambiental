import { Injectable } from '@nestjs/common';
import { DatosService } from '../../datos/services/datos.service';
import { TrabajosService } from '../../trabajos/services/trabajos.service';
import { mesTexto } from '../../shared/utils/fechas.util';
import { GenerarDto, RevisarDto } from '../dtos/reportes.dto';
import { ReportesService } from '../services/reportes.service';

@Injectable()
export class ReportesUC {
  constructor(
    private readonly reportes: ReportesService,
    private readonly datos: DatosService,
    private readonly trabajos: TrabajosService,
  ) {}

  archivosDeDatos() {
    return this.datos.listar();
  }

  revisar(dto: RevisarDto) {
    return this.reportes.revisar(dto.archivo, dto.periodo);
  }

  /**
   * Genera en segundo plano (devuelve el id del trabajo). Si el mes ya tiene reporte y quien llama no confirmó, no hace
   * nada y pide la confirmación: regenerar guarda una versión nueva y reemplaza los archivos de ese mes.
   */
  generar(dto: GenerarDto): { requiereConfirmacion: true; mensaje: string } | { trabajoId: string } {
    if (this.reportes.existe(dto.periodo) && !dto.confirmado) {
      return {
        requiereConfirmacion: true,
        mensaje: `Ya existe el reporte de ${mesTexto(dto.periodo)}. Se guardará como una versión nueva y reemplazará los archivos. ¿Lo sobrescribo?`,
      };
    }
    const trabajo = this.trabajos.lanzar('generar_reporte', () =>
      this.reportes.generar({ archivo: dto.archivo, periodo: dto.periodo, conLlm: dto.conLlm ?? true }),
    );
    return { trabajoId: trabajo.id };
  }

  async listar() {
    await this.reportes.sincronizar().catch(() => undefined); // si el disco falla, se muestra lo que hay en la base
    return this.reportes.listar();
  }

  analitica() {
    return this.reportes.analitica();
  }

  ultimo(periodo: string) {
    return this.reportes.ultimo(periodo);
  }

  versiones(periodo: string) {
    return this.reportes.versiones(periodo);
  }

  archivo(periodo: string, nombre: string) {
    return { ruta: this.reportes.rutaDeArchivo(periodo, nombre), tipo: this.reportes.tipoDe(nombre) };
  }
}

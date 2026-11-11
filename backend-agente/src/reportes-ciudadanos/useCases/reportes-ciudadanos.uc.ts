import { Injectable } from '@nestjs/common';
import { TIPOS_REPORTE } from '../../conocimiento/interfaces/reportes-ciudadanos.interface';
import { ConocimientoService } from '../../conocimiento/services/conocimiento.service';
import { ESTADOS_REPORTE, EstadoReporte } from '../../shared/entities/reporteCiudadano.entity';
import { FiltrosReportesDto, ReporteCiudadanoDto } from '../dtos/reportes-ciudadanos.dto';
import { DatosReporte, ReportesCiudadanosService } from '../services/reportes-ciudadanos.service';

const datos = (d: ReporteCiudadanoDto): DatosReporte => ({
  descripcion: d.descripcion, direccion: d.direccion, localidad: d.localidad, barrio: d.barrio, cuando: d.cuando, enCurso: d.enCurso,
  contacto: d.contacto, latitud: d.latitud, longitud: d.longitud, tipoPropuesto: d.tipo,
});

@Injectable()
export class ReportesCiudadanosUC {
  constructor(
    private readonly reportes: ReportesCiudadanosService,
    private readonly conocimiento: ConocimientoService,
  ) {}

  listar(f: FiltrosReportesDto) {
    return this.reportes.listar(f);
  }

  estadisticas() {
    return this.reportes.estadisticas();
  }

  catalogo() {
    const base = this.conocimiento.reportesCiudadanos;
    return {
      territorio: base.territorio,
      tipos: TIPOS_REPORTE.map((t) => ({ id: t, nombre: base.tipos[t].nombre, entidad: base.tipos[t].entidad })),
      localidades: base.localidades,
      estados: ESTADOS_REPORTE,
      aviso_radicado: base.aviso_radicado,
    };
  }

  analizar(d: ReporteCiudadanoDto) {
    const a = this.reportes.analizar(datos(d));
    return {
      tipo: a.decision.tipo, tipo_reglas: a.decision.tipoReglas, tipo_modelo: a.decision.tipoModelo, decision: a.decision.decision,
      prioridad: a.prioridad.prioridad, puntaje: a.prioridad.puntaje, motivos: a.prioridad.motivos, emergencia: a.prioridad.emergencia,
      localidad: a.localidad, entidad: a.enrutamiento.entidad, canales: a.enrutamiento.canales, normas: a.enrutamiento.normas,
    };
  }

  crear(d: ReporteCiudadanoDto) {
    return this.reportes.crear(datos(d), { canal: 'formulario', autor: 'ciudadano', evidenciaIds: d.evidenciaIds });
  }

  consultar(radicado: string) {
    return this.reportes.consultar(radicado);
  }

  cambiarEstado(radicado: string, estado: EstadoReporte, nota?: string) {
    return this.reportes.cambiarEstado(radicado, estado, nota);
  }
}

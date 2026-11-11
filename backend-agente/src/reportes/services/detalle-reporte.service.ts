import { Injectable } from '@nestjs/common';
import { Disponible, excedencias, niveles, noEvaluables, recorrer } from '../../analisis/hechos.util';
import { Hechos } from '../../analisis/interfaces/analisis.interface';
import { PlantillasService } from '../../redaccion/services/plantillas.service';
import { DetalleReporte, FilaSerie } from '../../shared/interfaces/detalle-reporte.interface';
import { mesTexto } from '../../shared/utils/fechas.util';

/** Un reporte tal como lo muestra la interfaz: se arma desde `hechos.json`, sin calcular nada nuevo. */
@Injectable()
export class DetalleReporteService {
  constructor(private readonly plantillas: PlantillasService) {}

  construir(hechos: Hechos, archivos: string[]): DetalleReporte {
    const filas: FilaSerie[] = [];
    for (const [estacion, contaminante, x] of recorrer(hechos)) {
      if (!x.disponible) continue;
      const d = x as Disponible;
      const maximos: FilaSerie['maximos'] = [];
      for (const [promedio, p] of Object.entries(d.promedios)) {
        const m = p.maximo ?? p.indicativo?.maximo;
        if (m) maximos.push({ promedio, valor: m.valor_ugm3, fecha: m.fecha_hora, limite: p.limite_ugm3 });
      }
      filas.push({
        estacion, contaminante, representatividad: d.representatividad_pct ?? 0, evaluable: d.evaluable, media: d.media_mensual_ugm3, maximos,
        excedencias: Object.values(d.promedios).reduce((a, p) => a + p.n_excedencias, 0),
      });
    }
    return {
      periodo: hechos.meta.periodo,
      mes: mesTexto(hechos.meta.periodo),
      estaciones: Object.keys(hechos.estaciones),
      resumen: this.plantillas.texto('resumen', hechos),
      filas,
      excedencias: excedencias(hechos),
      niveles: niveles(hechos),
      no_evaluables: noEvaluables(hechos).map((e) => ({ ...e, representatividad_pct: e.representatividad_pct ?? 0 })),
      advertencias: hechos.advertencias.filter((a) => a.severidad !== 'info'),
      archivos,
    };
  }
}

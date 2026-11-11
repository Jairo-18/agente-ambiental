import { BadRequestException, Injectable } from '@nestjs/common';
import { ConocimientoService } from '../../conocimiento/services/conocimiento.service';
import { FilaLimpia } from '../../datos/interfaces/fila.interface';
import { UnidadesService } from '../../normativa/services/unidades.service';
import { HORA_MS, indiceEsperado, inicioDelDia } from '../../shared/utils/fechas.util';
import { Punto } from '../interfaces/analisis.interface';

/** Series horarias en µg/m³ y promedios de corto plazo (1 h, 8 h, 24 h) según `validez_promedios` del YAML. */
@Injectable()
export class EstadisticaService {
  private readonly indices = new Map<string, number[]>();

  constructor(
    private readonly conocimiento: ConocimientoService,
    private readonly unidades: UnidadesService,
  ) {}

  indice(periodo: string): number[] {
    return this.indices.get(periodo) ?? this.indices.set(periodo, indiceEsperado(periodo)).get(periodo)!;
  }

  /**
   * Serie del contaminante en µg/m³ sobre todas las horas del mes (NaN donde falta). Devuelve null si la estación
   * no tiene esa variable. `datos` debe venir del QA/QC (una sola unidad por serie).
   */
  serieHorariaUgm3(datos: FilaLimpia[], estacion: string, contaminante: string, periodo: string): number[] | null {
    const nombres = this.conocimiento.base.contaminantes[contaminante].nombres_rmcab;
    const g = datos.filter((x) => x.estacion === estacion && nombres.includes(x.variable));
    if (!g.length) return null;
    const unidad = g.find((x) => x.unidad !== null)?.unidad ?? 'µg/m3';
    const porHora = new Map(g.map((x) => [x.t, x.valor]));
    return this.indice(periodo).map((t) => this.unidades.aUgm3(porHora.get(t) ?? NaN, contaminante, unidad));
  }

  representatividadPct(serie: number[]): number {
    return (100 * serie.filter((v) => !Number.isNaN(v)).length) / serie.length;
  }

  /**
   * Promedio de corto plazo de una serie horaria completa. Solo cuentan ventanas con horas suficientes.
   *  - '1h': el propio dato.
   *  - '8h': media móvil retrospectiva (la ventana termina en la hora indicada).
   *  - '24h': día calendario; las horas que terminan a las 00:00 pertenecen al día que cierran.
   */
  promedio(serie: number[], tipo: string, periodo: string): Punto[] {
    const minimo = this.conocimiento.base.validez_promedios.min_horas[tipo];
    if (minimo === undefined) throw new BadRequestException(`Promedio no soportado: '${tipo}'`);
    const idx = this.indice(periodo);
    if (tipo === '1h') return idx.map((t, i) => ({ t, valor: serie[i] }));

    if (tipo === '8h') {
      return idx.map((t, i) => {
        const ventana = serie.slice(Math.max(0, i - 7), i + 1).filter((v) => !Number.isNaN(v));
        return { t, valor: ventana.length >= minimo ? ventana.reduce((a, b) => a + b, 0) / ventana.length : NaN };
      });
    }
    if (tipo === '24h') {
      const dias = new Map<number, number[]>();
      idx.forEach((t, i) => {
        const dia = inicioDelDia(t - HORA_MS);
        (dias.get(dia) ?? dias.set(dia, []).get(dia)!).push(serie[i]);
      });
      return [...dias.entries()].map(([t, xs]) => {
        const validos = xs.filter((v) => !Number.isNaN(v));
        return { t, valor: validos.length >= minimo ? validos.reduce((a, b) => a + b, 0) / validos.length : NaN };
      });
    }
    throw new BadRequestException(`Promedio no soportado: '${tipo}'`);
  }
}

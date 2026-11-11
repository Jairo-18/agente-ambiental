import { BadRequestException, Injectable } from '@nestjs/common';
import { ConocimientoService } from '../../conocimiento/services/conocimiento.service';

// Unidades de masa/volumen -> µg/m³
const MASA: Record<string, number> = { 'ug/m3': 1, 'mg/m3': 1000, 'ng/m3': 0.001 };
// Fracción molar -> ppb
const FRACCION: Record<string, number> = { ppb: 1, ppm: 1000 };

/**
 * Conversión de concentraciones a µg/m³ (la unidad de la Res. 2254/2017). Los factores y las condiciones de
 * referencia (25 °C, 760 mmHg) salen de la base de conocimiento. Nunca se adivina: una unidad desconocida o
 * incompatible con el contaminante lanza un error.
 */
@Injectable()
export class UnidadesService {
  constructor(private readonly conocimiento: ConocimientoService) {}

  /** 'µg/m3', 'μg/m³', 'UG/M3' -> 'ug/m3'. */
  normalizar(unidad: string): string {
    return unidad.trim().toLowerCase().replace(/µ|μ/g, 'u').replace(/³/g, '3').replace(/ /g, '');
  }

  /** Convierte `valor` (en `unidad`) de `contaminante` a µg/m³. NaN entra, NaN sale. */
  aUgm3(valor: number, contaminante: string, unidad: string): number {
    const base = this.conocimiento.base;
    if (!(contaminante in base.contaminantes)) {
      throw new BadRequestException(`Contaminante sin norma de calidad del aire: '${contaminante}'`);
    }
    const u = this.normalizar(unidad);
    if (Number.isNaN(valor)) return valor;

    if (u in MASA) return valor * MASA[u];

    if (u in FRACCION) {
      const f = base.factores_conversion[contaminante];
      if (!f) throw new BadRequestException(`${contaminante} es particulado: no se puede convertir desde '${unidad}'`);
      // el factor del YAML está definido para `f.de` (ppb o ppm); se reescala si llega la otra
      return ((valor * FRACCION[u]) / FRACCION[f.de]) * f.factor;
    }
    throw new BadRequestException(`Unidad no reconocida: '${unidad}'`);
  }
}

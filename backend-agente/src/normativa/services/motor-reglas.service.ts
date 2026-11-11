import { Injectable } from '@nestjs/common';
import { ConocimientoService } from '../../conocimiento/services/conocimiento.service';
import { NIVELES, TEXTO_NIVEL } from '../../shared/constants/aire.constants';
import { fmtG } from '../../shared/utils/numeros.util';
import { Regla, Resultado } from '../interfaces/regla.interface';
import { UnidadesService } from './unidades.service';

/**
 * Motor de reglas de calidad del aire (Res. 2254/2017). Las reglas no se escriben a mano: se generan desde las
 * tablas de la base de conocimiento, así que el YAML sigue siendo la única fuente de verdad.
 *
 * Supuestos, ninguno confirmado por la norma (ver `pendientes` del YAML):
 *  - "excede" es valor > límite, sin redondear.
 *  - La Tabla 4 usa enteros (155-254, 255-354...). Un valor sin redondear se asigna al nivel más alto cuyo
 *    mínimo sea <= valor; así 254,5 queda en prevención.
 */
@Injectable()
export class MotorReglasService {
  private _reglas?: Regla[];

  constructor(
    private readonly conocimiento: ConocimientoService,
    private readonly unidades: UnidadesService,
  ) {}

  get reglas(): Regla[] {
    return (this._reglas ??= this.generarReglas());
  }

  private generarReglas(): Regla[] {
    const base = this.conocimiento.base;
    const reglas: Regla[] = base.limites.map((x) => ({
      id: x.id, tipo: 'limite', contaminante: x.contaminante, promedio: x.promedio, limite: x.limite, fuente: x.fuente,
    }));
    for (const n of base.niveles_excepcionales) {
      for (const nivel of NIVELES) {
        const [minimo, maximo] = n[nivel];
        reglas.push({
          id: `NIV-${n.contaminante.replace('.', '')}-${n.promedio.toUpperCase()}-${nivel.toUpperCase()}`,
          tipo: 'nivel', contaminante: n.contaminante, promedio: n.promedio, nivel, minimo, maximo,
          fuente: base.niveles_excepcionales_fuente,
        });
      }
    }
    return reglas;
  }

  /** Evalúa un valor ya promediado (`promedio` = '1h', '8h', '24h' o 'anual') contra la norma. */
  evaluar(contaminante: string, promedio: string, valor: number, unidad = 'µg/m3'): Resultado {
    const nombre = `${contaminante} (${promedio})`;

    if (Number.isNaN(valor)) {
      return {
        contaminante, promedio, valor, unidad, valor_ugm3: valor, estado: 'sin_dato', nivel_excepcional: null,
        conclusion: `${nombre}: sin dato; no se puede evaluar el cumplimiento.`, reglas: [], fuentes: [],
        explicacion: ['El valor es NaN: no se declara cumplimiento ni excedencia.'],
      };
    }

    const v = this.unidades.aUgm3(valor, contaminante, unidad);
    const pasos: string[] = [];
    if (this.unidades.normalizar(unidad) !== 'ug/m3') {
      pasos.push(`Conversión: ${fmtG(valor)} ${unidad} = ${fmtG(v)} µg/m³ (25 °C, 760 mmHg).`);
    }

    const aplicables = this.reglas.filter((r) => r.contaminante === contaminante && r.promedio === promedio);
    const limites = aplicables.filter((r) => r.tipo === 'limite');
    const niveles = aplicables.filter((r) => r.tipo === 'nivel');
    if (!aplicables.length) {
      return {
        contaminante, promedio, valor, unidad, valor_ugm3: v, estado: 'sin_regla', nivel_excepcional: null,
        conclusion: `${nombre}: la Res. 2254/2017 no define límite ni nivel para este promedio.`, reglas: [], fuentes: [],
        explicacion: [...pasos, 'Ninguna regla de la base de conocimiento aplica.'],
      };
    }

    const usadas: string[] = [];
    const fuentes: string[] = [];
    let estado: Resultado['estado'] = 'sin_regla';
    if (limites.length) {
      const lim = limites[0];
      estado = v > lim.limite! ? 'excede' : 'cumple';
      usadas.push(lim.id);
      fuentes.push(lim.fuente);
      pasos.push(`${lim.id}: ${fmtG(v)} ${estado === 'excede' ? '>' : '<='} ${fmtG(lim.limite!)} µg/m³ -> ${estado}.`);
    }

    let nivel: Resultado['nivel_excepcional'] = null;
    const alcanzados = niveles.filter((r) => v >= r.minimo!);
    if (alcanzados.length) {
      const r = alcanzados.reduce((a, b) => (b.minimo! > a.minimo! ? b : a));
      nivel = r.nivel!;
      usadas.push(r.id);
      if (!fuentes.includes(r.fuente)) fuentes.push(r.fuente);
      pasos.push(`${r.id}: ${fmtG(v)} >= ${fmtG(r.minimo!)} µg/m³ -> nivel de ${TEXTO_NIVEL[nivel]}.`);
      if (r.maximo !== null && r.maximo !== undefined && v > r.maximo) {
        pasos.push(
          `Nota: ${fmtG(v)} cae entre ${fmtG(r.maximo)} y ${fmtG(r.maximo + 1)}; la Tabla 4 usa enteros y aquí se asigna ` +
          'al nivel inferior (supuesto, no confirmado en la norma).',
        );
      }
    }

    const partes = [`${nombre}: ${fmtG(v)} µg/m³`];
    if (estado === 'excede') partes.push(`excede el nivel máximo permisible de ${fmtG(limites[0].limite!)} µg/m³`);
    else if (estado === 'cumple') partes.push(`cumple el nivel máximo permisible de ${fmtG(limites[0].limite!)} µg/m³`);
    else partes.push('no tiene nivel máximo permisible para este promedio');
    if (nivel) partes.push(`y está en nivel de ${TEXTO_NIVEL[nivel]} (Tabla 4)`);
    const conclusion = `${partes.slice(0, 2).join(', ')}${partes.length > 2 ? ` ${partes[2]}` : ''}.`;

    return {
      contaminante, promedio, valor, unidad, valor_ugm3: v, estado, nivel_excepcional: nivel, conclusion,
      reglas: usadas, fuentes, explicacion: pasos,
    };
  }
}

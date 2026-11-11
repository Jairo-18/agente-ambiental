import { Injectable } from '@nestjs/common';
import {
  Disponible, ExcedenciaEnEstacion, NivelEnEstacion, excedencias, niveles, noEvaluables, rankings, recorrer,
} from '../../analisis/hechos.util';
import { Hechos } from '../../analisis/interfaces/analisis.interface';
import { diaTexto, mesTexto } from '../../shared/utils/fechas.util';
import { n2 } from '../../shared/utils/numeros.util';
import { SECCIONES } from '../constants/redaccion.constants';

export interface PartesTexto {
  apertura: string;
  descriptivo: string;
  normativo: string;
  cierre: string;
}

const lista = (items: string[]) => (items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`);
const NOMBRE_NIVEL: Record<string, string> = { prevencion: 'prevención', alerta: 'alerta', emergencia: 'emergencia' };

const fraseExcedencia = (e: ExcedenciaEnEstacion) =>
  `${e.contaminante} en ${e.estacion} el ${diaTexto(e.fecha_hora)} (${n2(e.valor_ugm3)} µg/m³, límite de ${e.promedio} ${n2(e.limite_ugm3)} µg/m³)`;

const fraseNoEval = (l: { estacion: string; contaminante: string; representatividad_pct: number | null }[], minimo: number) =>
  `No alcanzaron el ${n2(minimo)} % de representatividad temporal y se presentan como indicativas, sin evaluar cumplimiento: ` +
  `${lista(l.map((e) => `${e.contaminante} en ${e.estacion} (${n2(e.representatividad_pct)} % de horas válidas)`))}.`;

const fraseNiveles = (l: NivelEnEstacion[]) =>
  `Se alcanzó nivel de ${lista([...new Set(l.map((n) => NOMBRE_NIVEL[n.nivel]))].sort())} según la Tabla 4 de la norma: ` +
  `${lista(l.map((n) => `${n.contaminante} en ${n.estacion} el ${diaTexto(n.fecha_hora)} (${n2(n.valor_ugm3)} µg/m³)`))}.`;

/**
 * El texto que escribe el CÓDIGO: borrador y respaldo cuando el modelo falla. Tiene cuatro partes: apertura y cierre
 * (fijos), `normativo` (excedencias, niveles y series no evaluables: lo que afirma cumplimiento) y `descriptivo`
 * (concentraciones por estación; el modelo puede reemplazar solo esta parte).
 */
@Injectable()
export class PlantillasService {
  partes(seccion: string, hechos: Hechos): PartesTexto {
    const cont = SECCIONES[seccion];
    const mes = mesTexto(hechos.meta.periodo);
    const exc = excedencias(hechos, cont);
    const niv = niveles(hechos, cont);
    const noe = noEvaluables(hechos, cont);
    const estaciones = Object.keys(hechos.estaciones);

    let apertura = '';
    if (seccion === 'resumen') {
      apertura = `En ${mes} se evaluó la calidad del aire en las estaciones ${lista(estaciones)} frente a los niveles máximos permisibles de la ${hechos.meta.norma}.`;
    } else if (seccion === 'conclusiones') {
      apertura = `El análisis de ${mes} cubre las estaciones ${lista(estaciones)}.`;
    }

    const descriptivo: string[] = [];
    if (seccion.startsWith('comentario_')) {
      for (const [est, c, x] of recorrer(hechos, cont)) {
        if (!x.disponible || !x.evaluable) continue;
        const [t, p] = Object.entries((x as Disponible).promedios)[0];
        if (p.maximo) {
          descriptivo.push(
            `En ${est}, ${c}: media mensual de ${n2(x.media_mensual_ugm3)} µg/m³ y máximo de ${t} de ${n2(p.maximo.valor_ugm3)} µg/m³ el ${diaTexto(p.maximo.fecha_hora)}.`,
          );
        }
      }
    }

    const normativo: string[] = [];
    normativo.push(
      exc.length
        ? `Se registraron excedencias de los niveles máximos permisibles: ${exc.map(fraseExcedencia).join('; ')}.`
        : 'No se registraron excedencias en las series evaluables.',
    );
    if (niv.length) normativo.push(fraseNiveles(niv));
    if (noe.length) normativo.push(fraseNoEval(noe, hechos.meta.representatividad_minima_pct));

    const cierre = seccion === 'resumen' || seccion === 'conclusiones' ? 'Los datos son preliminares y corresponden a un solo mes.' : '';
    return { apertura, descriptivo: descriptivo.join(' '), normativo: normativo.join(' '), cierre };
  }

  ensamblar(p: PartesTexto, descriptivo?: string): string {
    return [p.apertura, descriptivo ?? p.descriptivo, p.normativo, p.cierre].filter(Boolean).join(' ');
  }

  texto(seccion: string, hechos: Hechos): string {
    return this.ensamblar(this.partes(seccion, hechos));
  }

  /** Lo único que ve el modelo: concentraciones de las series evaluables. Sin límites, excedencias ni cumplimiento. */
  vistaDescriptiva(hechos: Hechos, contaminantes?: readonly string[] | null) {
    const estaciones: Record<string, Record<string, unknown>> = {};
    for (const [nombre, c, x] of recorrer(hechos, contaminantes)) {
      if (!x.disponible || !x.evaluable) continue;
      (estaciones[nombre] ??= {})[c] = {
        media_mensual_ugm3: x.media_mensual_ugm3,
        maximos_ugm3: Object.fromEntries(
          Object.entries(x.promedios).filter(([, p]) => p.maximo).map(([t, p]) => [t, { valor: p.maximo!.valor_ugm3, fecha_hora: p.maximo!.fecha_hora }]),
        ),
      };
    }
    return { periodo: hechos.meta.periodo, ranking_entre_estaciones: this.rankingParaModelo(hechos, contaminantes), estaciones };
  }

  /** Los rankings en el formato que se le muestra al modelo: él los copia, no los deduce. */
  rankingParaModelo(hechos: Hechos, contaminantes?: readonly string[] | null) {
    const out: Record<string, Record<string, { estacion_mas_alta: string[]; estacion_mas_baja: string[] }>> = {};
    for (const [c, r] of Object.entries(rankings(hechos, contaminantes))) {
      const fila: Record<string, { estacion_mas_alta: string[]; estacion_mas_baja: string[] }> = {};
      for (const [nombre, valores] of Object.entries(r.metricas)) {
        const v = Object.entries(valores);
        if (v.length < 2) continue;
        const hi = Math.max(...v.map(([, x]) => x));
        const lo = Math.min(...v.map(([, x]) => x));
        fila[nombre] = {
          estacion_mas_alta: v.filter(([, x]) => x === hi).map(([e]) => e).sort(),
          estacion_mas_baja: v.filter(([, x]) => x === lo).map(([e]) => e).sort(),
        };
      }
      if (Object.keys(fila).length) out[c] = fila;
    }
    return out;
  }

  /** Estaciones que el texto debe mencionar: las que tuvieron excedencias o series no evaluables. */
  exigidos(hechos: Hechos, contaminantes?: readonly string[] | null): string[] {
    const nombres = new Set([...excedencias(hechos, contaminantes).map((e) => e.estacion), ...noEvaluables(hechos, contaminantes).map((e) => e.estacion)]);
    return [...nombres].sort();
  }
}

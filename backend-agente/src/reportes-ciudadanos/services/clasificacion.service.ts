import { Injectable } from '@nestjs/common';
import { BaseReportesCiudadanos, TIPOS_REPORTE, TipoReporte } from '../../conocimiento/interfaces/reportes-ciudadanos.interface';
import { ConocimientoService } from '../../conocimiento/services/conocimiento.service';
import type { Prioridad } from '../../shared/entities/reporteCiudadano.entity';

/** minúsculas, sin tildes ni signos, espacios simples: así "Árbol" y "arbol" coinciden. */
export function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim();
}

/** Palabras (o frases) de la lista que aparecen completas en el texto ya normalizado. */
export function coincidencias(textoNormalizado: string, palabras: string[]): string[] {
  const t = ` ${textoNormalizado} `;
  return palabras.filter((p) => t.includes(` ${normalizar(p)} `));
}

/** Presente continuo ("están quemando", "está talando"): señal de que algo pasa ahora. */
const PRESENTE_CONTINUO = /\b(esta|estan|estamos)\s+([a-z]+\s+)?[a-z]+(ando|iendo|yendo)\b/;

/** Frases negadas ("no hay fuego", "sin heridos") que no deben sumar como peligro. */
const NEGACION = /\b(no|sin|ningun|ninguna|nada de)\s+(hay\s+|se ve\s+|veo\s+)?$/;

export interface ResultadoTipo {
  tipo: TipoReporte;
  puntos: number;
  pistas: string[];
}

export interface Decision {
  tipo: TipoReporte;
  tipoReglas: TipoReporte;
  tipoModelo: TipoReporte | null;
  /** Por qué ganó ese tipo (trazabilidad). */
  decision: string;
}

export interface ResultadoPrioridad {
  prioridad: Prioridad;
  puntaje: number;
  motivos: string[];
  emergencia: boolean;
}

export interface Enrutamiento {
  entidad: string;
  canales: { clave: string; nombre: string; detalle: string; corto: string }[];
  normas: string[];
  datosAPedir: string[];
}

/**
 * Clasificación y prioridad de un reporte ciudadano POR REGLAS (las del YAML). El modelo propone un tipo; aquí se
 * contrasta con las pistas del texto y se decide. La prioridad y la entidad nunca las decide el modelo.
 */
@Injectable()
export class ClasificacionService {
  constructor(private readonly conocimiento: ConocimientoService) {}

  private get base(): BaseReportesCiudadanos {
    return this.conocimiento.reportesCiudadanos;
  }

  esTipo(t: unknown): t is TipoReporte {
    return typeof t === 'string' && (TIPOS_REPORTE as readonly string[]).includes(t);
  }

  /** El tipo con más pistas en el texto (una frase de varias palabras vale 2; una palabra fuerte, 3). Sin pistas: 'otro'. */
  tipoPorReglas(texto: string): ResultadoTipo {
    const n = normalizar(texto);
    let mejor: ResultadoTipo = { tipo: 'otro', puntos: 0, pistas: [] };
    for (const tipo of TIPOS_REPORTE) {
      if (tipo === 'otro') continue;
      const fuertes = coincidencias(n, this.base.tipos[tipo].palabras_fuertes ?? []);
      const pistas = [...fuertes, ...coincidencias(n, this.base.tipos[tipo].palabras).filter((p) => !fuertes.includes(p))];
      const puntos = pistas.reduce((s, p) => s + (fuertes.includes(p) ? 3 : p.includes(' ') ? 2 : 1), 0);
      if (puntos > mejor.puntos) mejor = { tipo, puntos, pistas };
    }
    return mejor;
  }

  /**
   * Tipo final: si las reglas tienen evidencia clara (≥ 2 puntos) mandan ellas; si es débil, se acepta lo que propuso el
   * modelo (cuando es un tipo válido); sin nada, 'otro'.
   */
  decidirTipo(texto: string, propuestoPorModelo: unknown): Decision {
    const r = this.tipoPorReglas(texto);
    const modelo = this.esTipo(propuestoPorModelo) ? propuestoPorModelo : null;
    const base = { tipoReglas: r.tipo, tipoModelo: modelo };
    if (modelo && modelo === r.tipo) return { ...base, tipo: r.tipo, decision: `el modelo y las reglas coinciden (${r.pistas.join(', ') || 'sin pistas'})` };
    if (r.tipo !== 'otro' && (r.puntos >= 2 || !modelo || modelo === 'otro')) {
      return { ...base, tipo: r.tipo, decision: `reglas (${r.pistas.join(', ')})${modelo ? `; el modelo propuso ${modelo}` : ''}` };
    }
    if (modelo) return { ...base, tipo: modelo, decision: `propuesta del modelo (las reglas solo vieron: ${r.pistas.join(', ') || 'nada'})` };
    return { ...base, tipo: 'otro', decision: 'sin pistas en el texto ni propuesta válida del modelo' };
  }

  /** ¿El texto dice que está pasando ahora? (palabras del YAML o un presente continuo). */
  pasaAhora(texto: string): boolean {
    const n = normalizar(texto);
    return PRESENTE_CONTINUO.test(n) || coincidencias(n, this.base.reglas_prioridad.modificadores.en_curso.palabras ?? []).length > 0;
  }

  /** Prioridad = base del tipo + modificadores (YAML). "peligro" marca emergencia: hay que llamar al 123. */
  prioridad(tipo: TipoReporte, texto: string, enCurso: boolean): ResultadoPrioridad {
    const { modificadores: m, umbrales } = this.base.reglas_prioridad;
    const n = normalizar(texto);
    let puntaje = this.base.tipos[tipo].prioridad_base;
    const motivos = [`${this.base.tipos[tipo].nombre}: ${puntaje} punto(s) de base`];
    let emergencia = false;

    // "no hay llamas" / "sin heridos": lo que va justo antes de la palabra decide
    const peligro = coincidencias(n, m.peligro.palabras ?? []).filter((p) => !NEGACION.test(`${` ${n} `.split(` ${normalizar(p)} `)[0]} `));
    if (peligro.length) {
      puntaje += m.peligro.puntos;
      emergencia = !!m.peligro.emergencia;
      motivos.push(`peligro para personas (${peligro.join(', ')}): +${m.peligro.puntos}`);
    }
    if (enCurso) {
      puntaje += m.en_curso.puntos;
      motivos.push(`está pasando ahora: +${m.en_curso.puntos}`);
    }
    const sensible = coincidencias(n, m.receptor_sensible.palabras ?? []);
    if (sensible.length) {
      puntaje += m.receptor_sensible.puntos;
      motivos.push(`afecta un lugar sensible (${sensible.join(', ')}): +${m.receptor_sensible.puntos}`);
    }
    const recurrente = coincidencias(n, m.recurrente.palabras ?? []);
    if (recurrente.length) {
      puntaje += m.recurrente.puntos;
      motivos.push(`es recurrente (${recurrente.join(', ')}): +${m.recurrente.puntos}`);
    }
    const nocturno = tipo === 'ruido' ? coincidencias(n, m.nocturno_ruido.palabras ?? []) : [];
    if (nocturno.length) {
      puntaje += m.nocturno_ruido.puntos;
      motivos.push(`ruido en horario nocturno (${nocturno.join(', ')}): +${m.nocturno_ruido.puntos}`);
    }
    const prioridad: Prioridad = puntaje >= umbrales.alta ? 'alta' : puntaje >= umbrales.media ? 'media' : 'baja';
    return { prioridad, puntaje, motivos, emergencia };
  }

  /** A quién le toca y por dónde se radica oficialmente (YAML). */
  enrutar(tipo: TipoReporte): Enrutamiento {
    const t = this.base.tipos[tipo];
    return {
      entidad: t.entidad,
      canales: t.canales.map((clave) => ({ clave, nombre: this.base.canales[clave].nombre, detalle: this.base.canales[clave].detalle, corto: this.base.canales[clave].corto })),
      normas: t.normas,
      datosAPedir: t.datos_a_pedir,
    };
  }

  /** La localidad de Bogotá que se menciona (en el campo o en el texto), con su nombre oficial; null si no hay. */
  localidad(...textos: (string | null | undefined)[]): string | null {
    const n = normalizar(textos.filter(Boolean).join(' '));
    // primero las de varias palabras, para que "Rafael Uribe Uribe" no quede como otra cosa
    const lista = [...this.base.localidades].sort((a, b) => b.length - a.length);
    return lista.find((l) => coincidencias(n, [l]).length > 0) ?? null;
  }
}

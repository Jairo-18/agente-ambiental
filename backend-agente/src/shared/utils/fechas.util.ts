import { MESES } from '../constants/aire.constants';

export const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;
const p2 = (n: number) => String(n).padStart(2, '0');

/**
 * Las horas son instantes "ingenuos" (sin zona): se manejan como milisegundos UTC para que ningún cambio de
 * hora local las altere. `fecha_hora` es el FIN del periodo horario (01:00 = promedio de 00:01 a 01:00).
 */
export function parsearFecha(texto: unknown): number {
  if (typeof texto !== 'string') return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(texto.trim());
  if (!m) return NaN;
  const [anio, mes, dia, h, mi, s] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0', m[6] ?? '0'].map(Number);
  const t = Date.UTC(anio, mes - 1, dia, h, mi, s);
  const d = new Date(t);
  // rechaza fechas que JS "corrige" (31 de febrero, hora 25...)
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia && h < 24 && mi < 60 && s < 60 ? t : NaN;
}

/** Horas de un mes AAAA-MM como fin de periodo: de 01:00 del día 1 a 00:00 del mes siguiente (744 en octubre). */
export function indiceEsperado(periodo: string): number[] {
  const [anio, mes] = periodo.split('-').map(Number);
  const inicio = Date.UTC(anio, mes - 1, 1);
  const fin = Date.UTC(anio, mes, 1);
  const out: number[] = [];
  for (let t = inicio + HORA_MS; t <= fin; t += HORA_MS) out.push(t);
  return out;
}

/** Medianoche (UTC) del día al que pertenece `t`. */
export const inicioDelDia = (t: number): number => Math.floor(t / DIA_MS) * DIA_MS;

/** 'AAAA-MM-DD HH:MM:SS', como imprime pandas un Timestamp. */
export function fmtFechaHora(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

/** Marca de un promedio: el día para 24 h, día y hora para el resto. */
export function marcaDe(t: number, tipo: string): string {
  const s = fmtFechaHora(t);
  return tipo === '24h' ? s.slice(0, 10) : s.slice(0, 16);
}

export function mesTexto(periodo: string): string {
  const [anio, mes] = periodo.split('-');
  return `${MESES[Number(mes) - 1]} de ${anio}`;
}

/** '2026-10-28' -> '28 de octubre'; '2026-10-28 14:00' -> '28 de octubre a las 14:00'. */
export function diaTexto(marca: string): string {
  const [fecha, hora] = marca.split(' ');
  const [, mes, dia] = fecha.split('-');
  const s = `${Number(dia)} de ${MESES[Number(mes) - 1]}`;
  return hora ? `${s} a las ${hora}` : s;
}

/** Mes AAAA-MM del instante `t` (para saber a qué mes pertenece el último dato de un archivo). */
export function periodoDe(t: number): string {
  const d = new Date(t - HORA_MS);          // la hora 00:00 del día 1 cierra el mes anterior
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}`;
}

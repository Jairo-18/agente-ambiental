/** Redondeo a 2 decimales como en Python (`round(v, 2)`), o null si no hay valor. */
export function redondear2(v: number | null | undefined): number | null {
  return v == null || Number.isNaN(v) ? null : Number(v.toFixed(2));
}

/** Formato de cifra: hasta 6 cifras significativas y sin ceros sobrantes (como `:g` de Python tras `round(v, 2)`). */
export function fmtG(v: number): string {
  return String(Number(Number(v.toFixed(2)).toPrecision(6)));
}

/** '80.24', '75', '—' si no hay valor: dos decimales sin ceros sobrantes. */
export function n2(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

const validos = (xs: number[]) => xs.filter((x) => !Number.isNaN(x));

export const suma = (xs: number[]) => validos(xs).reduce((a, b) => a + b, 0);
export const media = (xs: number[]) => (validos(xs).length ? suma(xs) / validos(xs).length : NaN);
export const maximo = (xs: number[]) => (validos(xs).length ? Math.max(...validos(xs)) : NaN);
export const minimo = (xs: number[]) => (validos(xs).length ? Math.min(...validos(xs)) : NaN);
export const cuenta = (xs: number[]) => validos(xs).length;

export function mediana(xs: number[]): number {
  const v = validos(xs).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Longitud de la racha más larga de `true` consecutivos. */
export function rachaMaxima(marcas: boolean[]): number {
  let mejor = 0;
  let actual = 0;
  for (const m of marcas) {
    actual = m ? actual + 1 : 0;
    if (actual > mejor) mejor = actual;
  }
  return mejor;
}

/** Formato general sin redondeo previo: hasta 6 cifras significativas y sin ceros sobrantes (`:g` de Python). */
export function fmtGen(v: number): string {
  return String(Number(v.toPrecision(6)));
}

/**
 * Verificadores de texto escrito por el LLM. Todo el texto del modelo pasa por aquí antes de llegar a un reporte
 * o al usuario; si falla, se reintenta y, al final, responde el código con una plantilla.
 *
 *  - cifras: cada número del texto debe existir en los datos que se le dieron al modelo (o en la pregunta);
 *  - comparaciones: "más alto", "menor"... se contrastan con rankings que calcula el código;
 *  - citas: toda cita `[CLAVE]` debe ser un fragmento que se le entregó, y debe haber al menos una;
 *  - nombres de archivo: no puede escribir un archivo de datos que ninguna herramienta devolvió.
 *
 * Qué NO comprueba: números escritos con letras ("siete"), causas, efectos ni respuestas incompletas o mal
 * interpretadas. Por eso el modelo solo redacta secciones cortas y todo lo normativo lo escribe el código.
 */

// número que no forma parte de una palabra: 'PM2.5', 'O3' y '24h' no cuentan; '80.24', '28' y '2026-10-28' sí
const NUMERO = /(?<![\p{L}\p{N}_.,])\d+(?:[.,]\d+)?(?![\p{L}\p{N}_])/gu;
const CITA = /\[([A-Za-z0-9][A-Za-z0-9\-_.]*)\]/g;

export interface Cifra {
  token: string;
  valor: number;
}

export function extraerNumeros(texto: string): Cifra[] {
  return [...texto.matchAll(NUMERO)].map((m) => ({ token: m[0], valor: parseFloat(m[0].replace(',', '.')) }));
}

/** Todos los números que aparecen en estructuras anidadas (valores, claves y textos), incluidos '24h' -> 24. */
export function numerosPermitidos(...fuentes: unknown[]): Set<number> {
  const permitidos = new Set<number>();
  const recorrer = (x: unknown): void => {
    if (x === null || x === undefined || typeof x === 'boolean') return;
    if (typeof x === 'number') {
      if (!Number.isNaN(x)) permitidos.add(x);
    } else if (typeof x === 'string') {
      for (const n of extraerNumeros(x)) permitidos.add(n.valor);
      for (const m of x.matchAll(/(?<![\w.])(\d+)h\b/g)) permitidos.add(Number(m[1]));
    } else if (x instanceof Set || Array.isArray(x)) {
      for (const v of x) recorrer(v);
    } else if (typeof x === 'object') {
      for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
        recorrer(k);
        recorrer(v);
      }
    }
  };
  fuentes.forEach(recorrer);
  return permitidos;
}

export interface ResultadoCifras {
  ok: boolean;
  inventadas: string[];
  faltan: string[];
  n_cifras: number;
}

/** Cada cifra del texto debe estar en `permitidos`; y debe mencionar lo exigido (sin distinguir mayúsculas). */
export function verificar(texto: string, permitidos: Set<number>, exigidos: string[] = []): ResultadoCifras {
  const cifras = extraerNumeros(texto);
  const inventadas = cifras
    .filter((c) => ![...permitidos].some((p) => Math.abs(p - c.valor) < 1e-9))
    .map((c) => c.token);
  const faltan = exigidos.filter((e) => !texto.toLowerCase().includes(e.toLowerCase()));
  return { ok: !inventadas.length && !faltan.length, inventadas, faltan, n_cifras: cifras.length };
}

// ---------------------------------------------------------------- comparaciones entre estaciones

const ALTO = /\b(?:más|mas)\s+(?:alt|elevad)\w*|\bmayor(?:es)?\b/i;
const BAJO = /\b(?:más|mas)\s+baj\w*|\bmenor(?:es)?\b/i;
const CONTAMINANTES_TEXTO = ['PM10', 'PM2.5', 'SO2', 'NO2', 'O3', 'CO'];
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `rankings[contaminante] = { alto: estaciones, bajo: estaciones }`, calculados por código. */
export type Rankings = Record<string, { alto: Set<string>; bajo: Set<string> }>;

/**
 * Rechaza comparaciones entre estaciones que no coinciden con los rankings. Una cláusula con "más alto" o
 * "mayor" debe nombrar una estación que sea la más alta de cada contaminante que menciona (o del alcance, si no
 * menciona ninguno); igual con "más bajo" y "menor". Es una aproximación por cláusula: puede rechazar de más
 * (se reintenta o se usa la plantilla), pero una cláusula que nombre varias estaciones se aprueba si alguna es la
 * correcta. Por eso el LLM solo comenta un contaminante, o unos pocos gases, a la vez.
 */
export function verificarComparaciones(texto: string, rankings: Rankings, estaciones: string[], alcance: string[]): string[] {
  const problemas: string[] = [];
  // cláusulas, no frases: "Kennedy tuvo el CO más alto, mientras que Guaymaral ..." son dos afirmaciones.
  // Una cláusula que no nombra estación ni contaminante hereda los de la anterior de la misma frase.
  for (const oracion of texto.split(/(?<=[.;!?])\s+/)) {
    let nombradas = new Set<string>();
    let mencionados: string[] = [];
    for (const frase of oracion.split(/,?\s+mientras\s+(?:que\s+)?|,\s+(?:y|pero|aunque)\s+/)) {
      const propias = new Set(estaciones.filter((e) => frase.toLowerCase().includes(e.toLowerCase())));
      const cont = CONTAMINANTES_TEXTO.filter((c) => new RegExp(`(?<![\\w.])${escapar(c)}(?![\\w])`).test(frase));
      nombradas = propias.size ? propias : nombradas;
      mencionados = cont.length ? cont : mencionados;
      for (const [patron, clave] of [[ALTO, 'alto'], [BAJO, 'bajo']] as const) {
        if (!patron.test(frase)) continue;
        for (const c of mencionados.length ? mencionados : alcance) {
          const top = rankings[c]?.[clave] ?? new Set<string>();
          if (![...nombradas].some((e) => top.has(e))) {
            problemas.push(
              `'${frase.trim().slice(0, 80)}': ninguna estación nombrada es la de valor ${clave === 'alto' ? 'más alto' : 'más bajo'} en ${c}`,
            );
            break;
          }
        }
      }
    }
  }
  return problemas;
}

// ---------------------------------------------------------------- citas de fragmentos (RAG)

export function extraerCitas(texto: string): string[] {
  return [...texto.matchAll(CITA)].map((m) => m[1]);
}

export interface ResultadoCitas {
  ok: boolean;
  cifrasInventadas: string[];
  citasInexistentes: string[];
  sinCitas: boolean;
}

/** Respuesta con citas: cifras de los fragmentos (o la pregunta) y toda cita a un fragmento recuperado. */
export function verificarConCitas(texto: string, fuentes: string[], clavesRecuperadas: string[]): ResultadoCitas {
  const permitidas = numerosPermitidos(fuentes);
  const citas = extraerCitas(texto);
  // las claves (p. ej. LIM-PM10-24H) no cuentan como cifras de la respuesta
  const cifras = verificar(texto.replace(CITA, ' '), permitidas);
  const conocidas = new Set(clavesRecuperadas);
  const citasInexistentes = [...new Set(citas.filter((c) => !conocidas.has(c)))];
  const sinCitas = citas.length === 0;
  return {
    ok: cifras.ok && citasInexistentes.length === 0 && !sinCitas,
    cifrasInventadas: cifras.inventadas,
    citasInexistentes,
    sinCitas,
  };
}

export function describirProblemasCitas(v: ResultadoCitas): string {
  const p: string[] = [];
  if (v.cifrasInventadas.length) p.push(`cifras que no están en los fragmentos: ${v.cifrasInventadas.join(', ')}`);
  if (v.citasInexistentes.length) p.push(`citas a fragmentos que no se te dieron: ${v.citasInexistentes.join(', ')}`);
  if (v.sinCitas) p.push('no citaste ningún fragmento con el formato [CLAVE]');
  return p.join('; ');
}

// ---------------------------------------------------------------- nombres de archivo

// En una prueba real el modelo escribió "rmcab_10_largo.csv" por "rmcab_2026-10_largo.csv": ninguna cifra
// inventada, pero un nombre que no existe y que luego se copia y se pide.
const ARCHIVO_DE_DATOS = /[\w\-.]+\.(?:csv|xlsx)\b/gi;

/** Nombres de archivos de datos del texto que no aparecen en ninguna fuente (mensaje del usuario o herramientas). */
export function archivosInventados(texto: string, fuentes: unknown[]): string[] {
  const conocido = fuentes.map(String).join('\n');
  const nombres = new Set((texto.match(ARCHIVO_DE_DATOS) ?? []).filter((n) => !conocido.includes(n)));
  return [...nombres].sort();
}

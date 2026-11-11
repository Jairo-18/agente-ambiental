/** Cliente de la API del backend NestJS (a través del proxy de Next.js: rutas /api/...). */

export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

/** Nest devuelve { message: string | string[] } (validación) o { error } (motor); se muestra el mensaje útil. */
function mensajeDe(d: any, estado: number): string {
  if (Array.isArray(d?.message)) return d.message.join('. ');
  return d?.message ?? d?.error ?? `Error ${estado}`;
}

export async function api<T = any>(ruta: string, cuerpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(ruta, cuerpo === undefined ? undefined : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi('No hay conexión con el backend (¿está en marcha en el puerto 4000?).', 0);
  }
  let datos: any = null;
  try {
    datos = await r.json();
  } catch {
    /* sin cuerpo JSON */
  }
  if (!r.ok) throw new ErrorApi(mensajeDe(datos, r.status), r.status);
  return datos as T;
}

export interface Trabajo<T = any> {
  id: string;
  tipo: string;
  estado: 'en_curso' | 'listo' | 'error';
  resultado?: T;
  error?: { estado: number; mensaje: string };
}

/** Consulta un trabajo en segundo plano hasta que termina; `alTick` permite hacer algo mientras espera. */
export async function esperarTrabajo<T = any>(id: string, alTick?: () => Promise<void> | void): Promise<T> {
  for (;;) {
    const t = await api<Trabajo<T>>(`/api/trabajos/${id}`);
    if (t.estado === 'listo') return t.resultado as T;
    if (t.estado === 'error') throw new ErrorApi(t.error?.mensaje ?? 'Falló la operación', t.error?.estado ?? 500);
    await alTick?.();
    await new Promise((r) => setTimeout(r, 1200));
  }
}

export const num = (v: number | null | undefined): string => (v == null ? '—' : String(Math.round(v * 100) / 100));
export const fecha = (f: string): string => (f ?? '').replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1');
export const nivelTexto = (n: string): string => ({ prevencion: 'prevención' } as Record<string, string>)[n] ?? n;
export const fechaLarga = (iso: string): string =>
  new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

/** Tipos de lo que devuelve el backend (solo los campos que usa la interfaz). */
export interface Salud {
  backend: { activo: boolean };
  baseDeDatos: { activo: boolean; pgvector?: string | null; fragmentosNorma?: number; reportes?: number; error?: string };
  ollama: { activo: boolean; modelos: string[]; modeloChat: string; chatInstalado: boolean; modeloEmbeddings: string; embeddingsInstalado: boolean };
}
export interface ArchivoDatos {
  archivo: string;
  desde?: string;
  hasta?: string;
  estaciones?: string[];
  aviso?: string;
}
export interface ReporteFila {
  id: number;
  periodo: string;
  generado_en: string;
  archivo_datos: string;
  con_llm: boolean | null;
  origen: 'generado' | 'importado';
  n_excedencias: number;
  versiones: number;
}
export interface Revision {
  periodo: string;
  estaciones: string[];
  horas_esperadas: number;
  n_advertencias_por_severidad: { error: number; aviso: number; info: number };
  advertencias: string[];
  advertencias_omitidas: number;
  representatividad_pct: Record<string, Record<string, number>>;
  minimo_para_evaluar_pct: number;
}
export interface Detalle {
  periodo: string;
  mes: string;
  estaciones: string[];
  resumen: string;
  filas: {
    estacion: string;
    contaminante: string;
    representatividad: number;
    evaluable: boolean;
    media: number | null;
    maximos: { promedio: string; valor: number; fecha: string; limite: number | null }[];
    excedencias: number;
  }[];
  excedencias: { estacion: string; contaminante: string; promedio: string; fecha_hora: string; valor_ugm3: number; limite_ugm3: number; regla_id: string }[];
  niveles: { estacion: string; contaminante: string; promedio: string; fecha_hora: string; valor_ugm3: number; nivel: string }[];
  no_evaluables: { estacion: string; contaminante: string; representatividad_pct: number }[];
  advertencias: { codigo: string; severidad: string; mensaje: string }[];
  archivos: string[];
}
export interface Fragmento {
  clave: string;
  tipo: string;
  titulo: string;
  texto: string;
  fuente: string;
  verificado: boolean;
  similitud: number;
}
export interface RespuestaNorma {
  pregunta: string;
  respuesta: string;
  origen: 'llm' | 'extractiva' | 'sin_resultados';
  citas: Fragmento[];
  intentos: number;
  problemas: string[];
}

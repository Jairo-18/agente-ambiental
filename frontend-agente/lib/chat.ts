/** Cliente del chat libre: tipos, textos, conversaciones y el envío en streaming (NDJSON). */
import { ErrorApi } from './api';

export type ProveedorId = 'ollama' | 'deepseek' | 'claude';
export type Esfuerzo = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const PROVEEDOR: Record<ProveedorId, { nombre: string; detalle: string; inicial: string }> = {
  ollama: { nombre: 'Ollama', detalle: 'Local · tu GPU', inicial: 'O' },
  deepseek: { nombre: 'DeepSeek', detalle: 'API · OpenRouter', inicial: 'D' },
  claude: { nombre: 'Claude', detalle: 'Tu suscripción', inicial: 'C' },
};

export const ESFUERZO: Record<Esfuerzo, { corto: string; largo: string }> = {
  low: { corto: 'Baja', largo: 'Respuestas rápidas, razona poco. La que menos gasta.' },
  medium: { corto: 'Media', largo: 'Equilibrio entre calidad y velocidad.' },
  high: { corto: 'Alta', largo: 'Razona más antes de responder. Más lenta.' },
  xhigh: { corto: 'Muy alta', largo: 'Para problemas difíciles: código, matemáticas, análisis.' },
  max: { corto: 'Máx', largo: 'Todo el razonamiento posible. La más lenta y la que más gasta.' },
};

export interface ModeloInfo {
  id: string;
  nombre: string;
  grupo: string;
  descripcion: string | null;
  esfuerzos: Esfuerzo[];
  esfuerzoPorDefecto: Esfuerzo | null;
  entradas: ('imagen' | 'pdf')[];
  maxCaracteresDocumentos: number;
}
export interface EstadoProveedor {
  id: ProveedorId;
  nombre: string;
  disponible: boolean;
  modelos: ModeloInfo[];
  modeloPorDefecto: string | null;
  nota: string | null;
}
export interface ConversacionFila {
  id: string;
  titulo: string;
  proveedor: ProveedorId;
  modelo: string;
  actualizada_en: string;
  n_mensajes: number;
}
export interface MensajeChat {
  id?: number;
  rol: 'usuario' | 'asistente';
  contenido: string;
  razonamiento: string | null;
  proveedor: ProveedorId;
  modelo: string;
  esfuerzo: Esfuerzo | null;
  duracion_ms: number | null;
  error: string | null;
  adjuntos?: AdjuntoVista[];
  /** Solo en vivo: cómo entraron los archivos en la petición (completos o por fragmentos de la memoria vectorial). */
  contexto?: UsoContexto;
}
export interface ConversacionCompleta {
  id: string;
  titulo: string;
  proveedor: ProveedorId;
  modelo: string;
  mensajes: MensajeChat[];
}

export type EventoChat =
  | { tipo: 'inicio'; conversacionId: string; titulo: string; esfuerzo: Esfuerzo | null; contexto: UsoContexto }
  | { tipo: 'texto' | 'razonamiento'; texto: string }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'fin'; mensajeId: number; duracionMs: number };

/** Nombre bonito de un modelo a partir de la lista del proveedor (si ya no está, su id). */
export function nombreModelo(proveedores: EstadoProveedor[] | null, proveedor: ProveedorId, modelo: string): string {
  return proveedores?.find((p) => p.id === proveedor)?.modelos.find((m) => m.id === modelo)?.nombre ?? modelo;
}

export const duracion = (ms: number | null) => (ms == null ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

export async function borrarConversacion(id: string): Promise<void> {
  const r = await fetch(`/api/chat/conversaciones/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new ErrorApi(`No se pudo borrar (${r.status})`, r.status);
}

/** Envía un mensaje y llama a `alEvento` con cada línea del stream hasta que el backend cierra (o se aborta). */
export async function enviarMensaje(
  cuerpo: { conversacionId?: string; proveedor: ProveedorId; modelo: string; esfuerzo?: Esfuerzo; mensaje: string; instrucciones?: string; adjuntoIds?: string[] },
  alEvento: (e: EventoChat) => void,
  signal: AbortSignal,
): Promise<void> {
  let r: Response;
  try {
    r = await fetch('/api/chat/mensajes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal });
  } catch {
    if (signal.aborted) return;
    throw new ErrorApi('No hay conexión con el backend.', 0);
  }
  if (!r.ok || !r.body) {
    let mensaje = `Error ${r.status}`;
    try {
      const d = await r.json();
      mensaje = Array.isArray(d?.message) ? d.message.join('. ') : (d?.message ?? mensaje);
    } catch { /* sin cuerpo JSON */ }
    throw new ErrorApi(mensaje, r.status);
  }
  const lector = r.body.getReader();
  const decodificador = new TextDecoder();
  let resto = '';
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      resto += decodificador.decode(value, { stream: true });
      let i: number;
      while ((i = resto.indexOf('\n')) >= 0) {
        const linea = resto.slice(0, i).trim();
        resto = resto.slice(i + 1);
        if (linea) alEvento(JSON.parse(linea) as EventoChat);
      }
    }
  } catch (e) {
    if (!signal.aborted) throw e;
  }
}

/** Un archivo del chat tal como lo describe el backend (los bytes van por `/contenido`). */
export interface AdjuntoVista {
  id: string;
  tipo: 'documento' | 'imagen' | 'audio';
  nombre: string;
  mime: string;
  tamano: number;
  paginas: number | null;
  duracion_seg: number | null;
  caracteres: number;
  extracto: string | null;
  dictado: boolean;
  estado: 'procesando' | 'listo' | 'error';
  error: string | null;
  indexado: boolean;
  fragmentos?: number;
}
export interface UsoContexto {
  modo: 'ninguno' | 'completo' | 'fragmentos' | 'recortado';
  archivos: number;
  fragmentos: number;
}
export interface EstadoVoz {
  disponible: boolean;
  modelo: string;
  nota: string;
}

export const urlAdjunto = (id: string) => `/api/chat/adjuntos/${id}/contenido`;

/** Acepta el selector de archivos (lo mismo que sabe leer el backend). */
export const ACEPTA_ARCHIVOS = [
  '.pdf', '.docx', '.xlsx', '.csv', '.tsv', '.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.html', '.log', '.sql',
  '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.php', '.sh', '.r', '.ipynb',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'audio/*',
].join(',');

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function subir<T>(ruta: string, campo: string, archivo: Blob, nombre: string): Promise<T> {
  const form = new FormData();
  form.append(campo, archivo, nombre);
  let r: Response;
  try {
    r = await fetch(ruta, { method: 'POST', body: form });
  } catch {
    throw new ErrorApi('No hay conexión con el backend.', 0);
  }
  let d: any = null;
  try { d = await r.json(); } catch { /* sin cuerpo JSON */ }
  if (!r.ok) throw new ErrorApi(Array.isArray(d?.message) ? d.message.join('. ') : (d?.message ?? `Error ${r.status}`), r.status);
  return d as T;
}

export const subirAdjunto = (archivo: File) => subir<AdjuntoVista>('/api/chat/adjuntos', 'archivo', archivo, archivo.name);
export const transcribirNota = (audio: Blob, nombre: string) => subir<{ texto: string; adjunto: AdjuntoVista }>('/api/chat/voz/transcribir', 'audio', audio, nombre);

export async function quitarAdjunto(id: string): Promise<void> {
  await fetch(`/api/chat/adjuntos/${id}`, { method: 'DELETE' }).catch(() => undefined);
}

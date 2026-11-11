/** Lo común a los tres proveedores del chat libre (Ollama, DeepSeek, Claude). */

export type ProveedorId = 'ollama' | 'deepseek' | 'claude';
export const PROVEEDORES: ProveedorId[] = ['ollama', 'deepseek', 'claude'];

/** Un archivo que el modelo recibe tal cual (no como texto): imágenes, y PDF solo en Claude. */
export interface ArchivoBinario {
  nombre: string;
  mime: string;
  /** Contenido en base64. */
  base64: string;
}

export interface MensajeChat {
  rol: 'usuario' | 'asistente';
  /** Texto del mensaje; los documentos adjuntos ya van dentro, como texto extraído. */
  contenido: string;
  /** Solo en el último mensaje del usuario: imágenes (y PDF escaneados para Claude) que el modelo debe ver. */
  archivos?: ArchivoBinario[];
}

/** Qué recibe un modelo además de texto. Los documentos con texto valen para todos (se mandan extraídos). */
export type Entrada = 'imagen' | 'pdf';

/** Un pedazo de la respuesta según va llegando: el texto visible o el razonamiento del modelo (si lo expone). */
export interface Fragmento {
  tipo: 'texto' | 'razonamiento';
  texto: string;
}

/** Nivel de esfuerzo ("capacidad"): cuánto razona el modelo antes de responder. Más alto = mejor y más lento/caro. */
export type Esfuerzo = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export const ESFUERZOS: Esfuerzo[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export interface ModeloInfo {
  id: string;
  nombre: string;
  /** Para agrupar en el selector ("Más recientes", "Anteriores", "Instalados"…). */
  grupo: string;
  descripcion: string | null;
  /** Niveles que admite; vacío = no tiene control de esfuerzo. */
  esfuerzos: Esfuerzo[];
  esfuerzoPorDefecto: Esfuerzo | null;
  /** Imágenes / PDF nativos que acepta (vacío = solo texto). */
  entradas: Entrada[];
  /** Cuántos caracteres de documentos adjuntos caben en una petición (contexto del modelo, con margen). */
  maxCaracteresDocumentos: number;
}

export interface EstadoProveedor {
  id: ProveedorId;
  nombre: string;
  disponible: boolean;
  modelos: ModeloInfo[];
  modeloPorDefecto: string | null;
  /** Por qué no está disponible, o un dato útil (plan de la suscripción, saldo). */
  nota: string | null;
}

export interface PeticionChat {
  modelo: string;
  esfuerzo: Esfuerzo | null;
  sistema: string;
  mensajes: MensajeChat[];
  signal: AbortSignal;
}

export interface ProveedorChat {
  readonly id: ProveedorId;
  estado(): Promise<EstadoProveedor>;
  responder(p: PeticionChat): AsyncGenerator<Fragmento>;
}

/** Lee un cuerpo de respuesta por líneas (NDJSON de Ollama, SSE de DeepSeek, stdout de Claude). */
export async function* lineas(cuerpo: AsyncIterable<Uint8Array | string>): AsyncGenerator<string> {
  const decodificador = new TextDecoder();
  let resto = '';
  for await (const trozo of cuerpo) {
    resto += typeof trozo === 'string' ? trozo : decodificador.decode(trozo, { stream: true });
    let i: number;
    while ((i = resto.indexOf('\n')) >= 0) {
      const linea = resto.slice(0, i).replace(/\r$/, '');
      resto = resto.slice(i + 1);
      if (linea.trim()) yield linea;
    }
  }
  if (resto.trim()) yield resto;
}

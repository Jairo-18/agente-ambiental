import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent, fetch as undiciFetch } from 'undici';
import { AppConfig } from '../../config/configuration';
import { EstadoProveedor, Fragmento, lineas, ModeloInfo, PeticionChat, ProveedorChat } from '../interfaces/chat.interface';

const agente = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
/** Contexto que se le pide a Ollama (tokens). Más contexto = más VRAM: con 12 GB y un 14B, 8192 es lo cómodo. */
const NUM_CTX = 8192;
/** Lo que cabe de documentos adjuntos con ese contexto, dejando sitio al historial y a la respuesta (~3,5k tokens). */
const MAX_CARACTERES_DOCUMENTOS = 12_000;

/** Chat libre con los modelos de Ollama de este PC, en streaming (NDJSON de `/api/chat`). */
@Injectable()
export class OllamaChatService implements ProveedorChat {
  readonly id = 'ollama' as const;
  /** `capabilities` de cada modelo (por ejemplo "vision"); no cambian mientras el modelo esté instalado. */
  private readonly capacidades = new Map<string, string[]>();

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get url() {
    return this.config.get('ollama.url', { infer: true });
  }

  private async capacidadesDe(modelo: string): Promise<string[]> {
    const guardadas = this.capacidades.get(modelo);
    if (guardadas) return guardadas;
    try {
      const r = await undiciFetch(`${this.url}/api/show`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelo }), signal: AbortSignal.timeout(5000),
      });
      const capacidades = ((await r.json()) as { capabilities?: string[] }).capabilities ?? [];
      this.capacidades.set(modelo, capacidades);
      return capacidades;
    } catch {
      return [];
    }
  }

  /** Modelos instalados con su tamaño (`/api/tags`), sin los de embeddings, que no conversan. */
  private async instalados(): Promise<ModeloInfo[] | null> {
    try {
      const r = await undiciFetch(`${this.url}/api/tags`, { signal: AbortSignal.timeout(4000) });
      const d = (await r.json()) as { models?: { name: string; details?: { family?: string; parameter_size?: string; quantization_level?: string } }[] };
      const deChat = (d.models ?? []).filter((m) => !/embed/i.test(m.name));
      return Promise.all(
        deChat.map(async (m) => {
          const vision = (await this.capacidadesDe(m.name)).includes('vision');
          return {
            id: m.name,
            nombre: m.name,
            grupo: vision ? 'Con visión (ven imágenes)' : 'Solo texto',
            descripcion: [m.details?.family, m.details?.parameter_size, m.details?.quantization_level].filter(Boolean).join(' · ') || null,
            esfuerzos: [],
            esfuerzoPorDefecto: null,
            entradas: vision ? ['imagen' as const] : [],
            maxCaracteresDocumentos: MAX_CARACTERES_DOCUMENTOS,
          };
        }),
      );
    } catch {
      return null;
    }
  }

  async estado(): Promise<EstadoProveedor> {
    const modelos = await this.instalados();
    const preferido = this.config.get('ollama.chatModel', { infer: true });
    const lista = modelos ?? [];
    return {
      id: this.id,
      nombre: 'Ollama (local)',
      disponible: lista.length > 0,
      modelos: lista,
      modeloPorDefecto: lista.some((m) => m.id === preferido) ? preferido : (lista[0]?.id ?? null),
      nota: !modelos ? 'Ollama no responde: ejecuta `ollama serve`.' : lista.length ? 'Corre en tu GPU, sin Internet.' : 'No hay modelos de chat: `ollama pull qwen2.5:14b`.',
    };
  }

  async *responder({ modelo, sistema, mensajes, signal }: PeticionChat): AsyncGenerator<Fragmento> {
    let r: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      r = await undiciFetch(`${this.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelo,
          stream: true,
          messages: [
            { role: 'system', content: sistema },
            ...mensajes.map((m) => {
              const imagenes = (m.archivos ?? []).filter((a) => a.mime.startsWith('image/')).map((a) => a.base64);
              return { role: m.rol === 'usuario' ? 'user' : 'assistant', content: m.contenido, ...(imagenes.length ? { images: imagenes } : {}) };
            }),
          ],
          options: { num_ctx: NUM_CTX },
        }),
        dispatcher: agente,
        signal,
      });
    } catch {
      if (signal.aborted) return;
      throw new HttpException('No puedo conectar con Ollama. ¿Está en marcha? (ollama serve)', 503);
    }
    if (!r.ok || !r.body) throw new HttpException(`Ollama respondió ${r.status}: ${(await r.text()).slice(0, 300)}`, 502);

    for await (const linea of lineas(r.body)) {
      const d = JSON.parse(linea) as { message?: { content?: string; thinking?: string }; error?: string; done?: boolean };
      if (d.error) throw new HttpException(`Ollama: ${d.error}`, 502);
      if (d.message?.thinking) yield { tipo: 'razonamiento', texto: d.message.thinking };
      if (d.message?.content) yield { tipo: 'texto', texto: d.message.content };
      if (d.done) return;
    }
  }

  /**
   * Describe una imagen con un modelo de visión local (para poder buscarla por texto en la memoria vectorial).
   * Devuelve null si no hay ningún modelo con visión instalado.
   */
  async describirImagen(base64: string): Promise<string | null> {
    const modelos = (await this.instalados()) ?? [];
    const vision = modelos.find((m) => m.entradas.includes('imagen'));
    if (!vision) return null;
    const r = await undiciFetch(`${this.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: vision.id,
        stream: false,
        messages: [{ role: 'user', content: 'Describe en español, en un párrafo, qué muestra esta imagen. Si tiene texto, cifras o una tabla, transcríbelos.', images: [base64] }],
        options: { num_ctx: 4096, temperature: 0.1 },
      }),
      dispatcher: agente,
    });
    if (!r.ok) throw new Error(`Ollama respondió ${r.status} al describir la imagen`);
    return String(((await r.json()) as { message?: { content?: string } }).message?.content ?? '').trim() || null;
  }
}

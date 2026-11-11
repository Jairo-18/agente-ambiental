import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent, fetch as undiciFetch } from 'undici';
import { AppConfig } from '../../config/configuration';

// Generar un reporte o charlar con el modelo puede tardar minutos: sin límites de espera de cabecera ni de cuerpo.
const agente = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

export interface LlamadaOllama {
  function: { name: string; arguments: Record<string, unknown> | string };
}
export interface MensajeOllama {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: LlamadaOllama[];
  tool_name?: string;
}
export interface DefinicionHerramienta {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** Cliente de Ollama (el modelo corre en este PC): chat, chat con herramientas y embeddings. */
@Injectable()
export class OllamaService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get ollama() {
    return this.config.get('ollama', { infer: true });
  }

  private async post(ruta: string, cuerpo: object): Promise<any> {
    let r: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      r = await undiciFetch(`${this.ollama.url}${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        dispatcher: agente,
      });
    } catch {
      throw new HttpException('No puedo conectar con Ollama. ¿Está en marcha? (ollama serve)', 503);
    }
    if (!r.ok) throw new HttpException(`Ollama respondió ${r.status}: ${(await r.text()).slice(0, 200)}`, 502);
    return r.json();
  }

  /**
   * Embeddings de varios textos. Cada modelo pide su prefijo según el uso (documento o consulta):
   * EmbeddingGemma "title: none | text: " / "task: search result | query: "; nomic-embed-text "search_document: " / "search_query: ".
   */
  async embeddings(textos: string[], uso: 'documento' | 'consulta'): Promise<number[][]> {
    const { embeddingModel, embeddingDimensions } = this.ollama;
    const prefijo = prefijoEmbedding(embeddingModel, uso);
    const r = await this.post('/api/embed', { model: embeddingModel, input: textos.map((t) => prefijo + t) });
    const vectores: number[][] = r.embeddings;
    if (!Array.isArray(vectores) || vectores.length !== textos.length) {
      throw new HttpException('Ollama no devolvió los embeddings esperados', 502);
    }
    if (vectores[0].length !== embeddingDimensions) {
      throw new HttpException(`El modelo ${embeddingModel} devuelve ${vectores[0].length} dimensiones y el esquema espera ${embeddingDimensions}`, 500);
    }
    return vectores;
  }

  /** Una conversación sin herramientas; devuelve el texto del modelo. */
  async chat(mensajes: MensajeOllama[], temperatura = 0.2): Promise<string> {
    const r = await this.post('/api/chat', {
      model: this.ollama.chatModel, messages: mensajes, stream: false,
      options: { temperature: temperatura, num_ctx: 8192 },
    });
    return String(r.message?.content ?? '').trim();
  }

  /** Atajo: un mensaje de sistema y uno de usuario. */
  chatSimple(sistema: string, usuario: string): Promise<string> {
    return this.chat([{ role: 'system', content: sistema }, { role: 'user', content: usuario }]);
  }

  /** Un paso del agente: el modelo responde con texto o pide llamar herramientas. */
  async chatConHerramientas(mensajes: MensajeOllama[], herramientas: DefinicionHerramienta[]): Promise<MensajeOllama> {
    const r = await this.post('/api/chat', {
      model: this.ollama.chatModel, messages: mensajes, tools: herramientas, stream: false,
      options: { temperature: 0.2, num_ctx: 8192 },
    });
    return r.message as MensajeOllama;
  }

  async disponible(): Promise<{ activo: boolean; modelos: string[] }> {
    try {
      const r = await undiciFetch(`${this.ollama.url}/api/tags`, { signal: AbortSignal.timeout(4000) });
      const d = (await r.json()) as { models?: { name: string }[] };
      return { activo: true, modelos: (d.models ?? []).map((m) => m.name) };
    } catch {
      return { activo: false, modelos: [] };
    }
  }

  /** Una línea para el usuario: si Ollama responde y qué modelo está cargado en memoria. */
  async estadoTexto(): Promise<string> {
    try {
      const r = await undiciFetch(`${this.ollama.url}/api/ps`, { signal: AbortSignal.timeout(4000) });
      const d = (await r.json()) as { models?: { name: string }[] };
      return `Ollama: activo · modelo ${this.ollama.chatModel} · cargado en memoria: ${(d.models ?? []).map((m) => m.name).join(', ') || 'ninguno'}`;
    } catch {
      return 'Ollama: no responde (ejecuta `ollama serve`)';
    }
  }
}

/** Prefijo de tarea que espera cada modelo de embeddings (sin él la búsqueda pierde calidad). */
export function prefijoEmbedding(modelo: string, uso: 'documento' | 'consulta'): string {
  if (/embeddinggemma/i.test(modelo)) return uso === 'documento' ? 'title: none | text: ' : 'task: search result | query: ';
  if (/nomic/i.test(modelo)) return uso === 'documento' ? 'search_document: ' : 'search_query: ';
  return '';
}

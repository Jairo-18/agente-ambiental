import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent, fetch as undiciFetch } from 'undici';
import { AppConfig } from '../../config/configuration';
import { Esfuerzo, ESFUERZOS, EstadoProveedor, Fragmento, lineas, MensajeChat, ModeloInfo, PeticionChat, ProveedorChat } from '../interfaces/chat.interface';

const agente = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
const CINCO_MINUTOS = 5 * 60_000;

/** Lo que devuelven `GET /models` de OpenRouter y de DeepSeek (cada uno trae unos campos u otros). */
interface ModeloApi {
  id: string;
  name?: string;
  context_length?: number;
  context_window?: number;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
  effort?: { supported_levels?: string[]; default_level?: string };
  input_modalities?: string[];
  architecture?: { input_modalities?: string[] };
}

const dolaresPorMillon = (precio?: string) => (precio ? `$${(Number(precio) * 1e6).toFixed(2)}` : null);

export function describir(id: string, m?: ModeloApi): ModeloInfo {
  const contexto = m?.context_length ?? m?.context_window;
  const precio = m?.pricing?.prompt ? `${dolaresPorMillon(m.pricing.prompt)} / ${dolaresPorMillon(m.pricing.completion)} por M de tokens` : null;
  // OpenRouter acepta low/medium/high en los que anuncian `reasoning_effort`; DeepSeek directo dice sus niveles
  const esfuerzos: Esfuerzo[] = m?.effort?.supported_levels
    ? (m.effort.supported_levels.filter((e) => (ESFUERZOS as string[]).includes(e)) as Esfuerzo[])
    : m?.supported_parameters?.includes('reasoning_effort') ? ['low', 'medium', 'high'] : [];
  const porDefecto = (m?.effort?.default_level as Esfuerzo | undefined) ?? (esfuerzos.includes('medium') ? 'medium' : (esfuerzos[0] ?? null));
  return {
    id,
    nombre: (m?.name ?? id).replace(/^DeepSeek:\s*/, ''),
    grupo: /r1|reason/i.test(id) ? 'Razonadores' : 'Generales',
    descripcion: [contexto ? `${contexto >= 1e6 ? `${Math.round(contexto / 1048576)}M` : `${Math.round(contexto / 1024)}k`} de contexto` : null, precio].filter(Boolean).join(' · ') || null,
    esfuerzos,
    esfuerzoPorDefecto: esfuerzos.length ? porDefecto : null,
    entradas: (m?.architecture?.input_modalities ?? m?.input_modalities ?? []).includes('image') ? ['imagen'] : [],
    // con margen: ~2 caracteres por token del contexto, sin pasar de 300k
    maxCaracteresDocumentos: Math.min(300_000, Math.floor((contexto ?? 64_000) * 2)),
  };
}

/**
 * Chat con DeepSeek por su API (compatible con OpenAI: `POST /chat/completions` con SSE).
 * Con `DEEPSEEK_URL=https://openrouter.ai/api/v1` sirve igual para los modelos de DeepSeek en OpenRouter (así está hoy).
 */
@Injectable()
export class DeepseekService implements ProveedorChat {
  readonly id = 'deepseek' as const;
  private modelosCache: { en: number; modelos: ModeloInfo[] } | null = null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get cfg() {
    return this.config.get('chat.deepseek', { infer: true });
  }

  private cabeceras() {
    return { Authorization: `Bearer ${this.cfg.apiKey}`, 'Content-Type': 'application/json' };
  }

  private get esOpenRouter() {
    return /openrouter\.ai/.test(this.cfg.url);
  }

  /**
   * Modelos con nombre, contexto, precio y niveles de esfuerzo, tal como los describe `GET /models`.
   * Si DEEPSEEK_MODELS está definido, solo esos y en ese orden; si no, todos los de DeepSeek que liste la API.
   */
  private async modelos(): Promise<ModeloInfo[]> {
    if (this.modelosCache && Date.now() - this.modelosCache.en < CINCO_MINUTOS) return this.modelosCache.modelos;
    const r = await undiciFetch(`${this.cfg.url}/models`, { headers: this.cabeceras(), signal: AbortSignal.timeout(8000) });
    if (r.status === 401) throw new Error('La API key no es válida.');
    if (!r.ok) throw new Error(`GET /models respondió ${r.status}`);
    const d = (await r.json()) as { data?: ModeloApi[] };
    // OpenRouter lista cientos de modelos: solo interesan los de DeepSeek
    const porId = new Map((d.data ?? []).filter((m) => /deepseek/i.test(m.id)).map((m) => [m.id, m]));
    const ids = this.cfg.modelos.length ? this.cfg.modelos : [...porId.keys()].sort();
    const modelos = ids.map((id) => describir(id, porId.get(id)));
    this.modelosCache = { en: Date.now(), modelos };
    return modelos;
  }

  /** Solo la API oficial informa saldo; `null` si no se sabe. */
  private async saldo(): Promise<{ disponible: boolean; texto: string } | null> {
    if (!/api\.deepseek\.com/.test(this.cfg.url)) return null;
    try {
      const r = await undiciFetch(`${this.cfg.url}/user/balance`, { headers: this.cabeceras(), signal: AbortSignal.timeout(8000) });
      const d = (await r.json()) as { is_available?: boolean; balance_infos?: { currency: string; total_balance: string }[] };
      const b = d.balance_infos?.[0];
      return { disponible: d.is_available !== false, texto: b ? `${b.total_balance} ${b.currency}` : 'desconocido' };
    } catch {
      return null;
    }
  }

  async estado(): Promise<EstadoProveedor> {
    const base = { id: this.id, nombre: this.esOpenRouter ? 'DeepSeek (vía OpenRouter)' : 'DeepSeek (API)', modelos: [] as ModeloInfo[], modeloPorDefecto: null };
    if (!this.cfg.apiKey) return { ...base, disponible: false, nota: 'Falta DEEPSEEK_API_KEY en el .env del backend.' };
    try {
      const [modelos, saldo] = await Promise.all([this.modelos(), this.saldo()]);
      const conModelos = { ...base, modelos, modeloPorDefecto: modelos[0]?.id ?? null };
      if (saldo && !saldo.disponible) {
        return { ...conModelos, disponible: false, nota: `La cuenta de DeepSeek no tiene saldo (${saldo.texto}). Recarga en platform.deepseek.com o usa OpenRouter (ver CONTEXTO.md).` };
      }
      const via = this.esOpenRouter ? 'Cobra centavos por mensaje (precios por millón de tokens en cada modelo)' : null;
      return { ...conModelos, disponible: modelos.length > 0, nota: saldo ? `Saldo: ${saldo.texto}` : via };
    } catch (e) {
      return { ...base, disponible: false, nota: `No pude consultar DeepSeek: ${(e as Error).message}` };
    }
  }

  async *responder({ modelo, esfuerzo, sistema, mensajes, signal }: PeticionChat): AsyncGenerator<Fragmento> {
    if (!this.cfg.apiKey) throw new HttpException('Falta DEEPSEEK_API_KEY en el .env del backend.', 503);
    let r: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      r = await undiciFetch(`${this.cfg.url}/chat/completions`, {
        method: 'POST',
        headers: this.cabeceras(),
        body: JSON.stringify({
          model: modelo,
          stream: true,
          max_tokens: this.cfg.maxTokens,
          // OpenRouter: `reasoning.effort`; la API directa de DeepSeek sigue la convención de OpenAI (sin probar: la cuenta no tiene saldo)
          ...(esfuerzo ? (this.esOpenRouter ? { reasoning: { effort: esfuerzo } } : { reasoning_effort: esfuerzo }) : {}),
          messages: [
            { role: 'system', content: sistema },
            ...mensajes.map((m) => ({ role: m.rol === 'usuario' ? 'user' : 'assistant', content: contenidoOpenAI(m) })),
          ],
        }),
        dispatcher: agente,
        signal,
      });
    } catch {
      if (signal.aborted) return;
      throw new HttpException('No puedo conectar con la API de DeepSeek (¿hay Internet?).', 503);
    }
    if (!r.ok || !r.body) {
      const texto = await r.text();
      let mensaje = texto.slice(0, 300);
      try { mensaje = (JSON.parse(texto) as { error?: { message?: string } }).error?.message ?? mensaje; } catch { /* no es JSON */ }
      const openrouter = /openrouter\.ai/.test(this.cfg.url);
      if (r.status === 402 || /insufficient (balance|credits)|requires more credits/i.test(mensaje)) {
        const alcanza = /can only afford (\d+)/i.exec(mensaje)?.[1];
        mensaje = !openrouter
          ? 'La cuenta de DeepSeek no tiene saldo. Recarga en platform.deepseek.com.'
          : alcanza
            ? `El crédito de OpenRouter ya no alcanza para esta respuesta (cubre ${alcanza} tokens). Baja DEEPSEEK_MAX_TOKENS o recarga en openrouter.ai/credits.`
            : 'La cuenta de OpenRouter no tiene créditos. Recarga en openrouter.ai/credits.';
      }
      if (r.status === 401) mensaje = `La API key de ${openrouter ? 'OpenRouter' : 'DeepSeek'} no es válida.`;
      throw new HttpException(`DeepSeek: ${mensaje}`, r.status === 402 ? 402 : 502);
    }

    for await (const linea of lineas(r.body)) {
      if (!linea.startsWith('data:')) continue;
      const dato = linea.slice(5).trim();
      if (dato === '[DONE]') return;
      const d = JSON.parse(dato) as { choices?: { delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null } }[]; error?: { message?: string } };
      if (d.error) throw new HttpException(`DeepSeek: ${d.error.message ?? 'error en el stream'}`, 502);
      const delta = d.choices?.[0]?.delta;
      const razonamiento = delta?.reasoning_content ?? delta?.reasoning;
      if (razonamiento) yield { tipo: 'razonamiento', texto: razonamiento };
      if (delta?.content) yield { tipo: 'texto', texto: delta.content };
    }
  }
}

/** Texto solo, o (si trae imágenes) el formato multimodal de OpenAI: texto + `image_url` con data URI. */
function contenidoOpenAI(m: MensajeChat): string | object[] {
  const imagenes = (m.archivos ?? []).filter((a) => a.mime.startsWith('image/'));
  if (!imagenes.length) return m.contenido;
  return [
    { type: 'text', text: m.contenido },
    ...imagenes.map((a) => ({ type: 'image_url', image_url: { url: `data:${a.mime};base64,${a.base64}` } })),
  ];
}

import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent, FormData, fetch as undiciFetch } from 'undici';
import { AppConfig } from '../../config/configuration';

const agente = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

export interface EstadoVoz {
  disponible: boolean;
  modelo: string;
  /** Qué pasa: listo, descargando el modelo, servicio apagado… */
  nota: string;
}

/**
 * Voz a texto con Whisper local: el contenedor `stt` (Speaches, faster-whisper en la GPU) expone la API de OpenAI
 * `POST /v1/audio/transcriptions`. El audio no sale del PC. El modelo se descarga la primera vez (`POST /v1/models/{id}`).
 */
@Injectable()
export class VozService {
  private readonly logger = new Logger(VozService.name);
  private descargando: Promise<void> | null = null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get cfg() {
    return this.config.get('stt', { infer: true });
  }

  private async modeloInstalado(): Promise<boolean> {
    const r = await undiciFetch(`${this.cfg.url}/v1/models`, { signal: AbortSignal.timeout(5000) });
    const d = (await r.json()) as { data?: { id: string }[] };
    return (d.data ?? []).some((m) => m.id === this.cfg.modelo);
  }

  /** Pide al servicio que descargue el modelo (una sola vez; tarda unos minutos: ~1,6 GB). */
  private descargar(): void {
    if (this.descargando) return;
    this.logger.log(`Descargando el modelo de voz ${this.cfg.modelo}…`);
    this.descargando = undiciFetch(`${this.cfg.url}/v1/models/${this.cfg.modelo}`, { method: 'POST', dispatcher: agente })
      .then(async (r) => {
        if (!r.ok) throw new Error(`respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
        this.logger.log(`Modelo de voz ${this.cfg.modelo} listo`);
      })
      .catch((e: Error) => this.logger.warn(`No se pudo descargar el modelo de voz: ${e.message}`))
      .finally(() => (this.descargando = null));
  }

  async estado(): Promise<EstadoVoz> {
    const base = { modelo: this.cfg.modelo };
    try {
      if (await this.modeloInstalado()) return { ...base, disponible: true, nota: 'Whisper local en tu GPU: el audio no sale del PC.' };
      this.descargar();
      return { ...base, disponible: false, nota: 'Descargando el modelo de voz (la primera vez tarda unos minutos)…' };
    } catch {
      return { ...base, disponible: false, nota: 'El servicio de voz no responde (`docker compose up -d stt`).' };
    }
  }

  private get tts() {
    return this.config.get('tts', { infer: true });
  }

  voces(): { voces: string[]; porDefecto: string } {
    return { voces: this.tts.voces, porDefecto: this.tts.voz };
  }

  /** Lee un texto en voz alta (Kokoro, MP3). La primera vez el servicio carga el modelo (unos segundos más). */
  async hablar(texto: string, voz?: string): Promise<Buffer> {
    const entrada = paraVoz(texto);
    if (!entrada) throw new HttpException('No hay nada que leer.', 400);
    const elegida = voz && this.tts.voces.includes(voz) ? voz : this.tts.voz;
    let r: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      r = await undiciFetch(`${this.cfg.url}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.tts.modelo, voice: elegida, input: entrada, response_format: 'mp3', speed: 1.0 }),
        dispatcher: agente,
      });
    } catch {
      throw new HttpException('El servicio de voz no responde (`docker compose up -d stt`).', 503);
    }
    if (r.status === 404) {
      void undiciFetch(`${this.cfg.url}/v1/models/${this.tts.modelo}`, { method: 'POST', dispatcher: agente }).catch(() => undefined);
      throw new HttpException('El modelo de voz (Kokoro) se está descargando; inténtalo en un minuto.', 503);
    }
    if (!r.ok) throw new HttpException(`El servicio de voz respondió ${r.status}: ${(await r.text()).slice(0, 200)}`, 502);
    return Buffer.from(await r.arrayBuffer());
  }

  /** Transcribe una grabación (webm/ogg/wav/mp3…) en el idioma configurado. */
  async transcribir(audio: Buffer, mime: string, nombre: string): Promise<{ texto: string; duracionSeg: number | null }> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), nombre);
    form.append('model', this.cfg.modelo);
    form.append('language', this.cfg.idioma);
    form.append('response_format', 'verbose_json');
    let r: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      r = await undiciFetch(`${this.cfg.url}/v1/audio/transcriptions`, { method: 'POST', body: form, dispatcher: agente });
    } catch {
      throw new HttpException('El servicio de voz no responde (`docker compose up -d stt`).', 503);
    }
    if (r.status === 404) {
      this.descargar();
      throw new HttpException('El modelo de voz se está descargando; inténtalo en unos minutos.', 503);
    }
    if (!r.ok) throw new HttpException(`El servicio de voz respondió ${r.status}: ${(await r.text()).slice(0, 200)}`, 502);
    const d = (await r.json()) as { text?: string; duration?: number };
    return { texto: String(d.text ?? '').trim(), duracionSeg: typeof d.duration === 'number' ? d.duration : null };
  }
}

/** Unidades y signos que el sintetizador leería mal, en palabras. */
const LECTURA: [RegExp, string][] = [
  [/µg\/m(?:³|3)/g, ' microgramos por metro cúbico'],
  [/dB\(A\)/g, ' decibeles'],
  [/\bPM2[.,]5\b/g, 'PM dos punto cinco'],
  [/\bPM10\b/g, 'PM diez'],
  [/\bNO2\b/g, 'N O dos'],
  [/\bSO2\b/g, 'S O dos'],
  [/\bO3\b/g, 'ozono'],
  [/\bSDA\b/g, 'S D A'],
  [/·/g, ','],
  [/→/g, ':'],
];

/** Texto listo para leer en voz alta: sin Markdown, enlaces, emojis ni etiquetas; con unidades en palabras. */
export function paraVoz(texto: string, maximo = 1500): string {
  let t = texto
    .replace(/```[\s\S]*?```/g, ' (hay un bloque de código en la pantalla) ')
    .replace(/https?:\/\/\S+/g, 'el enlace que aparece en pantalla')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, (correo) => correo.replace('@', ' arroba ').replace(/\./g, ' punto '))
    .replace(/\[([A-Z0-9-]{3,})\]/g, '') // citas [CLAVE] de la norma
    .replace(/^\s*(?:[-•]|\d+[.)])\s+/gm, '') // viñetas
    .replace(/[*_`#>|]+/g, ' ')
    .replace(/\p{Extended_Pictographic}/gu, '');
  for (const [patron, lectura] of LECTURA) t = t.replace(patron, lectura);
  // teléfonos (7 o más cifras seguidas): dígito por dígito, no "tres millones setecientos…"
  t = t.replace(/\b\d{7,}\b/g, (n) => n.split('').join(' '));
  t = t.replace(/\s*\n+\s*/g, '. ').replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').replace(/([.:])\.+/g, '$1').trim();
  return t.length > maximo ? `${t.slice(0, t.lastIndexOf(' ', maximo))}… El resto está en la pantalla.` : t;
}

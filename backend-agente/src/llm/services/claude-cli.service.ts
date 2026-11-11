import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppConfig } from '../../config/configuration';
import { MODELOS_CLAUDE } from '../constants/modelos-claude';
import { EstadoProveedor, Fragmento, lineas, MensajeChat, PeticionChat, ProveedorChat } from '../interfaces/chat.interface';

const UN_MINUTO = 60_000;

/**
 * Chat con Claude usando la SUSCRIPCIÓN del usuario (Pro/Max), sin API key: se ejecuta Claude Code en modo
 * no interactivo (`claude -p`, salida stream-json) con todas sus herramientas apagadas, así que solo conversa.
 * La sesión es la de `claude auth login` en este PC, o en Docker la variable CLAUDE_CODE_OAUTH_TOKEN (`claude setup-token`).
 * Consume el mismo cupo de uso que Claude Code y claude.ai. Uso personal: no exponer esta API a terceros.
 */
@Injectable()
export class ClaudeCliService implements ProveedorChat {
  readonly id = 'claude' as const;
  private readonly logger = new Logger(ClaudeCliService.name);
  private estadoCache: { en: number; estado: EstadoProveedor } | null = null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get cfg() {
    return this.config.get('chat.claude', { infer: true });
  }

  /** En Windows `claude` es un .cmd (no se puede lanzar sin shell): se busca el ejecutable real que instala npm. */
  private ejecutable(): string {
    if (this.cfg.cli) return this.cfg.cli;
    if (process.platform === 'win32' && process.env.APPDATA) {
      const exe = join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
      if (existsSync(exe)) return exe;
    }
    return 'claude';
  }

  /** Ejecuta el CLI y devuelve su salida completa (para `auth status`). */
  private ejecutar(args: string[], msMaximo: number): Promise<{ codigo: number | null; salida: string }> {
    return new Promise((resolve, reject) => {
      const p = spawn(this.ejecutable(), args, { cwd: tmpdir(), env: process.env, windowsHide: true });
      let salida = '';
      const reloj = setTimeout(() => p.kill(), msMaximo);
      p.stdout.on('data', (d) => (salida += d));
      p.on('error', (e) => { clearTimeout(reloj); reject(e); });
      p.on('close', (codigo) => { clearTimeout(reloj); resolve({ codigo, salida }); });
    });
  }

  async estado(): Promise<EstadoProveedor> {
    if (this.estadoCache && Date.now() - this.estadoCache.en < UN_MINUTO) return this.estadoCache.estado;
    const modelos = this.cfg.modelos.length ? MODELOS_CLAUDE.filter((m) => this.cfg.modelos.includes(m.id)) : MODELOS_CLAUDE;
    const porDefecto = modelos.find((m) => m.id === this.cfg.modeloPorDefecto)?.id ?? modelos[0]?.id ?? null;
    const base = { id: this.id, nombre: 'Claude (suscripción)', modelos, modeloPorDefecto: porDefecto };
    let estado: EstadoProveedor;
    try {
      const { salida } = await this.ejecutar(['auth', 'status'], 20_000);
      const d = JSON.parse(salida.slice(salida.indexOf('{'))) as { loggedIn?: boolean; authMethod?: string; subscriptionType?: string };
      const conToken = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
      estado = d.loggedIn || conToken
        ? { ...base, disponible: true, nota: d.subscriptionType ? `Plan ${d.subscriptionType} · usa tu cupo de Claude` : 'Sesión de Claude Code activa · usa tu cupo de Claude' }
        : { ...base, disponible: false, nota: 'Claude Code no tiene sesión: ejecuta `claude auth login` (o en Docker, `claude setup-token` y pon CLAUDE_CODE_OAUTH_TOKEN en el .env).' };
    } catch (e) {
      const noInstalado = (e as NodeJS.ErrnoException).code === 'ENOENT';
      estado = { ...base, disponible: false, nota: noInstalado ? 'No encuentro Claude Code (`npm i -g @anthropic-ai/claude-code`).' : `Claude Code no respondió: ${(e as Error).message}` };
    }
    this.estadoCache = { en: Date.now(), estado };
    return estado;
  }

  /** `claude -p` recibe un solo texto: con historial, la conversación va transcrita y se pide responder el último turno. */
  private prompt(mensajes: MensajeChat[]): string {
    if (mensajes.length === 1) return mensajes[0].contenido;
    const transcripcion = mensajes
      .map((m) => (m.rol === 'usuario' ? `<usuario>\n${m.contenido}\n</usuario>` : `<asistente>\n${m.contenido}\n</asistente>`))
      .join('\n\n');
    return `Esta es la conversación hasta ahora:\n\n${transcripcion}\n\nResponde al último mensaje del usuario, sin repetir las etiquetas.`;
  }

  /**
   * Entrada en stream-json (un mensaje de usuario por línea, formato de la API de Anthropic): así viajan las
   * imágenes y los PDF del último mensaje como bloques nativos, antes del texto.
   */
  private entrada(mensajes: MensajeChat[]): string {
    const archivos = mensajes[mensajes.length - 1]?.archivos ?? [];
    const bloques = archivos.map((a) =>
      a.mime === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: a.mime, data: a.base64 }, title: a.nombre }
        : { type: 'image', source: { type: 'base64', media_type: a.mime, data: a.base64 } },
    );
    return `${JSON.stringify({ type: 'user', message: { role: 'user', content: [...bloques, { type: 'text', text: this.prompt(mensajes) }] } })}\n`;
  }

  async *responder({ modelo, esfuerzo, sistema, mensajes, signal }: PeticionChat): AsyncGenerator<Fragmento> {
    const args = [
      '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence',
      '--model', modelo, '--system-prompt', sistema,
      ...(esfuerzo ? ['--effort', esfuerzo] : []),
    ];
    const p = spawn(this.ejecutable(), args, { cwd: tmpdir(), env: process.env, windowsHide: true });
    const alAbortar = () => p.kill();
    signal.addEventListener('abort', alAbortar, { once: true });
    let errorDeProceso: Error | null = null;
    let stderr = '';
    p.on('error', (e) => (errorDeProceso = e));
    p.stderr.on('data', (d) => (stderr += d));
    p.stdin.on('error', () => undefined); // si el proceso muere antes de leer
    p.stdin.end(this.entrada(mensajes));

    let resultado: { is_error?: boolean; subtype?: string; result?: string } | null = null;
    try {
      for await (const linea of lineas(p.stdout)) {
        let d: any;
        try { d = JSON.parse(linea); } catch { continue; }
        if (d.type === 'stream_event' && d.event?.type === 'content_block_delta') {
          const delta = d.event.delta;
          if (delta?.type === 'text_delta' && delta.text) yield { tipo: 'texto', texto: delta.text };
          if (delta?.type === 'thinking_delta' && delta.thinking) yield { tipo: 'razonamiento', texto: delta.thinking };
        } else if (d.type === 'result') {
          resultado = d;
        }
      }
    } finally {
      signal.removeEventListener('abort', alAbortar);
      if (p.exitCode === null) p.kill();
    }
    if (signal.aborted) return;
    if (errorDeProceso) {
      const e = errorDeProceso as NodeJS.ErrnoException;
      throw new HttpException(e.code === 'ENOENT' ? 'No encuentro Claude Code (`npm i -g @anthropic-ai/claude-code`).' : `Claude Code: ${e.message}`, 503);
    }
    if (!resultado || resultado.is_error || resultado.subtype !== 'success') {
      const detalle = (resultado?.result || stderr || 'terminó sin respuesta').trim().slice(0, 400);
      this.logger.warn(`claude -p falló: ${detalle}`);
      this.estadoCache = null;
      const sinSesion = /not logged in|\/login|invalid api key|authentication|oauth/i.test(detalle);
      throw new HttpException(sinSesion ? 'Claude Code no tiene sesión válida: ejecuta `claude auth login` (o renueva CLAUDE_CODE_OAUTH_TOKEN).' : `Claude: ${detalle}`, sinSesion ? 401 : 502);
    }
  }
}

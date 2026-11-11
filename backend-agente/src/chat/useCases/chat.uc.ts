import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { In } from 'typeorm';
import { AppConfig } from '../../config/configuration';
import { VozService } from '../../llm/services/voz.service';
import { ChatAdjunto } from '../../shared/entities/chatAdjunto.entity';
import { ChatConversacion } from '../../shared/entities/chatConversacion.entity';
import { ChatMensaje } from '../../shared/entities/chatMensaje.entity';
import { ChatAdjuntoRepository } from '../../shared/repositories/chatAdjunto.repository';
import { ChatConversacionRepository } from '../../shared/repositories/chatConversacion.repository';
import { ChatMensajeRepository } from '../../shared/repositories/chatMensaje.repository';
import { EnviarChatDto } from '../dtos/chat.dto';
import { AdjuntosService, ArchivoSubido, vistaAdjunto } from '../services/adjuntos.service';
import { ChatService } from '../services/chat.service';
import { ContextoService, UsoContexto } from '../services/contexto.service';
import { MemoriaService } from '../services/memoria.service';

/** Lo que el navegador recibe línea a línea (NDJSON) mientras el modelo responde. */
type Evento =
  | { tipo: 'inicio'; conversacionId: string; titulo: string; esfuerzo: string | null; contexto: UsoContexto }
  | { tipo: 'texto' | 'razonamiento'; texto: string }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'fin'; mensajeId: number; duracionMs: number };

const vistaMensaje = (m: ChatMensaje, adjuntos: ChatAdjunto[] = []) => ({
  id: m.chatMensajeId, rol: m.rol, contenido: m.contenido, razonamiento: m.razonamiento,
  proveedor: m.proveedor, modelo: m.modelo, esfuerzo: m.esfuerzo, duracion_ms: m.duracionMs, error: m.error, creado_en: m.creadoEn,
  adjuntos: adjuntos.map((a) => vistaAdjunto(a)),
});

@Injectable()
export class ChatUC {
  private readonly logger = new Logger(ChatUC.name);

  constructor(
    private readonly chat: ChatService,
    private readonly contexto: ContextoService,
    private readonly archivos: AdjuntosService,
    private readonly memoria: MemoriaService,
    private readonly voz: VozService,
    private readonly conversaciones: ChatConversacionRepository,
    private readonly mensajes: ChatMensajeRepository,
    private readonly adjuntos: ChatAdjuntoRepository,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  proveedores() {
    return this.chat.estados();
  }

  estadoVoz() {
    return this.voz.estado();
  }

  async listar() {
    const lista = await this.conversaciones.listar();
    return lista.map((c) => ({ id: c.chatConversacionId, titulo: c.titulo, proveedor: c.proveedor, modelo: c.modelo, actualizada_en: c.actualizadaEn, n_mensajes: c.nMensajes }));
  }

  private async conversacion(id: string): Promise<ChatConversacion> {
    const c = await this.conversaciones.findOne({ where: { chatConversacionId: id } });
    if (!c) throw new NotFoundException('No existe esa conversación.');
    return c;
  }

  /** Adjuntos de una conversación agrupados por el mensaje en que se enviaron. */
  private async adjuntosPorMensaje(chatConversacionId: string): Promise<Map<number, ChatAdjunto[]>> {
    const mapa = new Map<number, ChatAdjunto[]>();
    for (const a of await this.adjuntos.deLaConversacion(chatConversacionId)) {
      if (a.mensaje) mapa.set(a.mensaje.chatMensajeId, [...(mapa.get(a.mensaje.chatMensajeId) ?? []), a]);
    }
    return mapa;
  }

  async obtener(id: string) {
    const c = await this.conversacion(id);
    const [mensajes, adjuntos] = await Promise.all([this.mensajes.deLaConversacion(id), this.adjuntosPorMensaje(id)]);
    return {
      id: c.chatConversacionId, titulo: c.titulo, proveedor: c.proveedor, modelo: c.modelo,
      mensajes: mensajes.map((m) => vistaMensaje(m, adjuntos.get(m.chatMensajeId))),
    };
  }

  async eliminar(id: string) {
    await this.conversaciones.remove(await this.conversacion(id));
    return { eliminada: id };
  }

  subirAdjunto(archivo: ArchivoSubido | undefined) {
    return this.archivos.subir(archivo);
  }

  /** Nota de voz del micrófono: se guarda (audio + transcripción indexada) y el texto vuelve al navegador. */
  async transcribir(audio: ArchivoSubido | undefined) {
    const adjunto = await this.archivos.subir(audio, { dictado: true });
    const { texto } = await this.adjuntos.findOneByOrFail({ chatAdjuntoId: adjunto.id });
    return { texto: texto ?? '', adjunto };
  }

  contenidoAdjunto(id: string) {
    return this.archivos.contenido(id);
  }

  eliminarAdjunto(id: string) {
    return this.archivos.eliminar(id);
  }

  /** Búsqueda por significado en todos los archivos, notas de voz e imágenes descritas del chat. */
  async buscar(q: string, conversacionId?: string) {
    const ids = conversacionId ? (await this.adjuntos.deLaConversacion(conversacionId)).map((a) => a.chatAdjuntoId) : undefined;
    const encontrados = await this.memoria.buscar(q, 10, ids);
    return encontrados.map((f) => ({
      adjunto_id: f.chatAdjuntoId, nombre: f.nombre, tipo: f.tipo, conversacion_id: f.chatConversacionId, conversacion: f.titulo,
      fragmento: f.orden + 1, similitud: Math.round(f.similitud * 1000) / 1000, texto: f.texto,
    }));
  }

  /**
   * Un turno del chat en streaming. Las validaciones (proveedor caído, modelo desconocido, adjunto que el modelo no
   * puede ver) responden con un error HTTP normal; una vez empieza el stream, los errores van como evento `error`.
   * Si el navegador corta (botón "Detener"), se aborta la petición al modelo y se guarda lo que alcanzó a llegar.
   */
  async enviar(dto: EnviarChatDto, res: Response): Promise<void> {
    const { proveedor, esfuerzo, modelo } = await this.chat.proveedorListo(dto.proveedor, dto.modelo, dto.esfuerzo);
    const ids = [...new Set(dto.adjuntoIds ?? [])];
    if ((await this.adjuntos.sueltos(ids)).length !== ids.length) throw new BadRequestException('Algún archivo adjunto no existe o ya se envió en otro mensaje.');
    const nuevos = await this.adjuntos.conDatos(ids);
    this.contexto.validar(nuevos, modelo);

    const texto = dto.mensaje.trim();
    const conversacion = dto.conversacionId
      ? await this.conversacion(dto.conversacionId)
      : await this.conversaciones.save(this.conversaciones.create({ titulo: titulo(texto), proveedor: dto.proveedor, modelo: dto.modelo }));
    const delUsuario = await this.mensajes.save(this.mensajes.create({ conversacion, rol: 'usuario', contenido: texto, proveedor: dto.proveedor, modelo: dto.modelo }));
    if (ids.length) await this.adjuntos.update({ chatAdjuntoId: In(ids) }, { mensaje: { chatMensajeId: delUsuario.chatMensajeId }, conversacion: { chatConversacionId: conversacion.chatConversacionId } });
    await this.conversaciones.tocar(conversacion, dto.proveedor, dto.modelo);

    const maximo = this.config.get('chat.historialMaximo', { infer: true });
    const porMensaje = await this.adjuntosPorMensaje(conversacion.chatConversacionId);
    porMensaje.set(delUsuario.chatMensajeId, nuevos); // los del mensaje actual, con sus bytes (imágenes, PDF escaneados)
    const historial = (await this.mensajes.deLaConversacion(conversacion.chatConversacionId))
      .filter((m) => m.contenido.trim() || porMensaje.has(m.chatMensajeId))
      .slice(-maximo);
    const { mensajes, uso } = await this.contexto.armar(historial, porMensaje, modelo);

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    // no-transform: que ningún proxy (ni la compresión de Next.js) acumule la respuesta antes de mandarla
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const emitir = (e: Evento) => { if (!res.writableEnded) res.write(`${JSON.stringify(e)}\n`); };

    const control = new AbortController();
    res.on('close', () => { if (!res.writableFinished) control.abort(); });

    emitir({ tipo: 'inicio', conversacionId: conversacion.chatConversacionId, titulo: conversacion.titulo, esfuerzo, contexto: uso });
    const inicio = Date.now();
    let contenido = '';
    let razonamiento = '';
    let error: string | null = null;
    try {
      for await (const f of proveedor.responder({ modelo: dto.modelo, esfuerzo, sistema: this.chat.sistema(dto.instrucciones), mensajes, signal: control.signal })) {
        if (f.tipo === 'texto') contenido += f.texto;
        else razonamiento += f.texto;
        emitir(f);
      }
      if (control.signal.aborted) error = 'Detenido por el usuario.';
    } catch (e) {
      error = control.signal.aborted ? 'Detenido por el usuario.' : ((e as Error).message ?? 'Error inesperado');
      if (!control.signal.aborted) this.logger.warn(`${dto.proveedor}/${dto.modelo}: ${error}`);
      emitir({ tipo: 'error', mensaje: error });
    }

    const duracionMs = Date.now() - inicio;
    const guardado = await this.mensajes.save(
      this.mensajes.create({ conversacion, rol: 'asistente', contenido, razonamiento: razonamiento || null, proveedor: dto.proveedor, modelo: dto.modelo, esfuerzo, duracionMs, error }),
    );
    emitir({ tipo: 'fin', mensajeId: guardado.chatMensajeId, duracionMs });
    res.end();
  }
}

/** Título de la conversación: el comienzo del primer mensaje, en una línea. */
function titulo(texto: string): string {
  const linea = texto.replace(/\s+/g, ' ').trim();
  return linea.length > 80 ? `${linea.slice(0, 77)}…` : linea;
}

import { ConflictException, Injectable } from '@nestjs/common';
import { AdjuntosService } from '../../chat/services/adjuntos.service';
import { ChatAdjunto } from '../../shared/entities/chatAdjunto.entity';
import { ConversacionRepository } from '../../shared/repositories/conversacion.repository';
import { MensajeRepository } from '../../shared/repositories/mensaje.repository';
import { TrabajosService } from '../../trabajos/services/trabajos.service';
import { AgenteService } from '../services/agente.service';
import { ConfirmacionesService } from '../services/confirmaciones.service';
import { HerramientasService } from '../services/herramientas.service';

/** Lo que el agente "ve" de cada evidencia: el modelo de texto no ve imágenes, pero sí su descripción y las transcripciones. */
function describirEvidencias(adjuntos: ChatAdjunto[]): string {
  return adjuntos
    .map((a) => {
      if (a.tipo === 'imagen') return `[Foto adjunta «${a.nombre}»${a.texto ? `: ${a.texto.slice(0, 800)}` : ' (sin descripción)'}]`;
      if (a.tipo === 'audio') return a.dictado ? '' : `[Audio adjunto transcrito: ${(a.texto ?? '').slice(0, 1500)}]`;
      return `[Documento adjunto «${a.nombre}»: ${(a.texto ?? '').slice(0, 1500)}]`;
    })
    .filter(Boolean)
    .join('\n');
}

@Injectable()
export class AsistenteUC {
  constructor(
    private readonly agente: AgenteService,
    private readonly confirmaciones: ConfirmacionesService,
    private readonly trabajos: TrabajosService,
    private readonly conversaciones: ConversacionRepository,
    private readonly mensajes: MensajeRepository,
    private readonly herramientas: HerramientasService,
    private readonly archivos: AdjuntosService,
  ) {}

  /** Una petición puede incluir generar un reporte (minutos): se corre en segundo plano y se devuelve el id del trabajo. */
  enviar(mensaje: string, adjuntoIds: string[] = [], canal: 'texto' | 'voz' = 'texto'): { trabajoId: string } {
    return { trabajoId: this.trabajos.lanzar('chat', () => this.conversar(mensaje, adjuntoIds, canal)).id };
  }

  /** Un turno del agente (herramientas fijas y verificación de cifras); la conversación queda guardada. */
  async conversar(mensaje: string, adjuntoIds: string[] = [], canal: 'texto' | 'voz' = 'texto') {
    const conversacion = await this.conversaciones.vigente();
    await this.mensajes.registrar(conversacion, 'usuario', mensaje);
    // las evidencias de este mensaje quedan disponibles para registrar el reporte (y se acumulan hasta que se registre)
    const evidencias = adjuntoIds.length ? await this.archivos.conTexto(adjuntoIds) : [];
    this.herramientas.contexto = {
      evidencias: [...new Set([...this.herramientas.contexto.evidencias, ...adjuntoIds])],
      canal: canal === 'voz' || this.herramientas.contexto.canal === 'voz' ? 'voz' : 'texto',
    };
    const extra = describirEvidencias(evidencias);
    const turno = await this.agente.responder(extra ? `${mensaje}\n\n${extra}` : mensaje);
    const llamadas = turno.llamadas.map((l) => ({ herramienta: l.herramienta, argumentos: l.argumentos, error: (l.resultado.error as string | undefined) ?? null }));
    await this.mensajes.registrar(conversacion, 'agente', turno.respuesta, llamadas, turno.origen);
    return {
      respuesta: turno.respuesta, origen: turno.origen, problemas: turno.problemas, llamadas,
      reportes_generados: turno.llamadas.filter((l) => l.resultado.generado).map((l) => l.resultado.periodo as string),
      conversacionId: conversacion.conversacionId,
    };
  }

  async historial() {
    const conversacion = await this.conversaciones.vigente();
    const mensajes = await this.mensajes.deLaConversacion(conversacion.conversacionId);
    return {
      conversacionId: conversacion.conversacionId,
      mensajes: mensajes.map((m) => ({ rol: m.rol, contenido: m.contenido, herramientas: m.herramientas, origen: m.origen, creado_en: m.creadoEn })),
    };
  }

  pendiente() {
    return { pendiente: this.confirmaciones.pendiente() };
  }

  confirmar(id: string, ok: boolean) {
    return this.confirmaciones.responder(id, ok);
  }

  async nueva() {
    if (this.trabajos.enCurso()) throw new ConflictException('Hay una operación en curso; espera a que termine.');
    this.agente.nuevaConversacion();
    this.herramientas.contexto = { evidencias: [], canal: 'texto' };
    return { conversacionId: (await this.conversaciones.nueva()).conversacionId };
  }
}

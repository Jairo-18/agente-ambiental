import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ArchivoBinario, MensajeChat, ModeloInfo } from '../../llm/interfaces/chat.interface';
import { ChatAdjunto } from '../../shared/entities/chatAdjunto.entity';
import { ChatMensaje } from '../../shared/entities/chatMensaje.entity';
import { transcripcionIncluida } from '../../shared/utils/texto.util';
import { MemoriaService } from './memoria.service';

/** Cómo entraron los archivos de la conversación en la petición (se le muestra al usuario). */
export interface UsoContexto {
  modo: 'ninguno' | 'completo' | 'fragmentos' | 'recortado';
  archivos: number;
  fragmentos: number;
}

/** Tamaño aproximado de un fragmento con su encabezado: sirve para calcular cuántos caben. */
const CARACTERES_POR_FRAGMENTO = 1100;
const MAX_FRAGMENTOS = 40;

/** El texto de un adjunto se le pasa al modelo si es un documento, un audio subido (no dictado) o una imagen descrita. */
const textual = (a: ChatAdjunto) => !!a.texto && (a.tipo === 'documento' || (a.tipo === 'audio' && !a.dictado));
const atributos = (a: ChatAdjunto) => `nombre="${a.nombre.replace(/"/g, "'")}" tipo="${a.tipo}"${a.paginas ? ` paginas="${a.paginas}"` : ''}`;

/**
 * Arma lo que recibe el modelo: el historial con los archivos de cada mensaje. Si los documentos caben en el
 * contexto del modelo van enteros; si no, se usa la memoria vectorial y van solo los fragmentos más parecidos a la
 * pregunta (RAG). Las imágenes (y los PDF sin texto, en Claude) del último mensaje viajan como archivos nativos.
 */
@Injectable()
export class ContextoService {
  private readonly logger = new Logger(ContextoService.name);

  constructor(private readonly memoria: MemoriaService) {}

  /** Antes de enviar: el modelo elegido tiene que poder ver lo que se adjunta en este mensaje. */
  validar(nuevos: ChatAdjunto[], modelo: ModeloInfo): void {
    const imagenes = nuevos.filter((a) => a.tipo === 'imagen');
    if (imagenes.length && !modelo.entradas.includes('imagen')) {
      throw new BadRequestException(`${modelo.nombre} no ve imágenes. Usa Claude, DeepSeek V4.1 Flash o un modelo de Ollama con visión (qwen2.5vl).`);
    }
    const escaneados = nuevos.filter((a) => a.tipo === 'documento' && a.mime === 'application/pdf' && !a.texto);
    if (escaneados.length && !modelo.entradas.includes('pdf')) {
      throw new BadRequestException(`«${escaneados[0].nombre}» no tiene texto (¿está escaneado?). Solo Claude puede leerlo tal cual.`);
    }
    const fallidos = nuevos.filter((a) => a.estado === 'error' && !(a.mime === 'application/pdf' && modelo.entradas.includes('pdf')));
    if (fallidos.length) throw new BadRequestException(`No pude leer «${fallidos[0].nombre}»: ${fallidos[0].error}`);
  }

  async armar(
    historial: ChatMensaje[],
    adjuntosPorMensaje: Map<number, ChatAdjunto[]>,
    modelo: ModeloInfo,
  ): Promise<{ mensajes: MensajeChat[]; uso: UsoContexto }> {
    const ultimo = historial[historial.length - 1];
    const todos = historial.flatMap((m) => adjuntosPorMensaje.get(m.chatMensajeId) ?? []);
    const conTexto = todos.filter(textual);
    const total = conTexto.reduce((s, a) => s + (a.texto?.length ?? 0), 0);
    const presupuesto = modelo.maxCaracteresDocumentos;

    let modo: UsoContexto['modo'] = conTexto.length ? 'completo' : 'ninguno';
    let fragmentos = '';
    let nFragmentos = 0;
    let recorte = 1;
    if (total > presupuesto) {
      try {
        const k = Math.max(3, Math.min(MAX_FRAGMENTOS, Math.floor(presupuesto / CARACTERES_POR_FRAGMENTO)));
        const encontrados = await this.memoria.buscar(ultimo.contenido, k, conTexto.map((a) => a.chatAdjuntoId));
        nFragmentos = encontrados.length;
        fragmentos = encontrados.map((f) => `[«${f.nombre}», fragmento ${f.orden + 1} · similitud ${f.similitud.toFixed(2)}]\n${f.texto}`).join('\n\n');
        modo = 'fragmentos';
      } catch (e) {
        // sin memoria vectorial (Ollama caído): cada documento se recorta en proporción
        this.logger.warn(`Sin búsqueda vectorial, se recortan los documentos: ${(e as Error).message}`);
        recorte = presupuesto / total;
        modo = 'recortado';
      }
    }

    const mensajes: MensajeChat[] = historial
      .filter((m) => m.contenido.trim() || (adjuntosPorMensaje.get(m.chatMensajeId) ?? []).length)
      .map((m) => {
        const adj = adjuntosPorMensaje.get(m.chatMensajeId) ?? [];
        const partes: string[] = [];
        for (const a of adj) {
          if (textual(a)) {
            if (modo === 'fragmentos') {
              partes.push(`<archivo ${atributos(a)} caracteres="${a.texto!.length}">(Demasiado largo para mandarlo entero: sus fragmentos más relevantes van en <fragmentos_relevantes>.)</archivo>`);
            } else {
              const texto = recorte < 1 ? `${a.texto!.slice(0, Math.floor(a.texto!.length * recorte))}\n(… recortado: no cabía entero)` : a.texto!;
              partes.push(`<archivo ${atributos(a)}>\n${texto}\n</archivo>`);
            }
          } else if (a.tipo === 'audio' && a.dictado && a.texto && !transcripcionIncluida(m.contenido, a.texto)) {
            // se envió la nota de voz sin su texto en la caja (vacía o borrada): el modelo necesita lo que se dijo
            partes.push(`[Nota de voz transcrita: ${a.texto}]`);
          } else if (a.tipo === 'imagen' && m !== ultimo) {
            partes.push(`[Imagen adjunta «${a.nombre}»${a.texto ? `: ${a.texto.slice(0, 600)}` : ''}]`);
          } else if (a.tipo === 'documento' && !a.texto && m !== ultimo) {
            partes.push(`[PDF sin texto «${a.nombre}» (enviado antes)]`);
          }
        }
        if (m === ultimo && fragmentos) partes.push(`<fragmentos_relevantes>\n${fragmentos}\n</fragmentos_relevantes>`);
        const contenido = [...partes, m.contenido].filter(Boolean).join('\n\n');
        return { rol: m.rol, contenido, ...(m === ultimo ? { archivos: binarios(adj, modelo) } : {}) };
      });

    // la nota de voz dictada ya es el texto del mensaje: no cuenta como archivo leído
    const nArchivos = todos.filter((a) => !(a.tipo === 'audio' && a.dictado)).length;
    return { mensajes, uso: { modo: nArchivos && modo === 'ninguno' ? 'completo' : modo, archivos: nArchivos, fragmentos: nFragmentos } };
  }
}

/** Lo que el modelo recibe como archivo: imágenes y, si lo admite (Claude), los PDF sin texto. */
function binarios(adjuntos: ChatAdjunto[], modelo: ModeloInfo): ArchivoBinario[] {
  return adjuntos
    .filter((a) => (a.tipo === 'imagen' && modelo.entradas.includes('imagen')) || (a.mime === 'application/pdf' && !a.texto && modelo.entradas.includes('pdf')))
    .filter((a) => a.datos)
    .map((a) => ({ nombre: a.nombre, mime: a.mime, base64: a.datos.toString('base64') }));
}

import { BadRequestException, Injectable, Logger, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { OllamaChatService } from '../../llm/services/ollama-chat.service';
import { VozService } from '../../llm/services/voz.service';
import { ChatAdjunto } from '../../shared/entities/chatAdjunto.entity';
import { ChatAdjuntoRepository } from '../../shared/repositories/chatAdjunto.repository';
import { clasificar, ExtraccionService } from './extraccion.service';
import { MemoriaService } from './memoria.service';

export interface ArchivoSubido {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Lo que ve el navegador de un adjunto (nunca los bytes: esos van por `/contenido`). */
export const vistaAdjunto = (a: ChatAdjunto, nFragmentos?: number) => ({
  id: a.chatAdjuntoId, tipo: a.tipo, nombre: a.nombre, mime: a.mime, tamano: a.tamano, paginas: a.paginas, duracion_seg: a.duracionSeg,
  caracteres: a.texto?.length ?? 0, extracto: a.texto ? a.texto.slice(0, 280) : null, dictado: a.dictado,
  estado: a.estado, error: a.error, indexado: a.indexado, ...(nFragmentos !== undefined ? { fragmentos: nFragmentos } : {}),
});

/**
 * Sube un archivo al chat: lo guarda en PostgreSQL, saca su texto (documentos), lo transcribe (audio) o lo describe
 * con un modelo de visión local (imágenes, en segundo plano) y lo indexa en la memoria vectorial.
 */
@Injectable()
export class AdjuntosService {
  private readonly logger = new Logger(AdjuntosService.name);

  constructor(
    private readonly repo: ChatAdjuntoRepository,
    private readonly extraccion: ExtraccionService,
    private readonly memoria: MemoriaService,
    private readonly voz: VozService,
    private readonly vision: OllamaChatService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async subir(archivo: ArchivoSubido | undefined, opciones: { dictado?: boolean } = {}) {
    if (!archivo?.buffer?.length) throw new BadRequestException('No llegó ningún archivo.');
    const maxMb = this.config.get('chat.adjuntoMaxMb', { infer: true });
    if (archivo.size > maxMb * 1024 * 1024) throw new PayloadTooLargeException(`El archivo pasa de ${maxMb} MB.`);
    // multer entrega el nombre en latin1; los nombres con tildes llegan en UTF-8
    const nombre = Buffer.from(archivo.originalname || 'archivo', 'latin1').toString('utf8').slice(0, 255);
    const { tipo, mime } = clasificar(archivo.mimetype, nombre);
    if (opciones.dictado && tipo !== 'audio') throw new BadRequestException('Una nota de voz tiene que ser audio.');

    const adjunto = this.repo.create({ tipo, nombre, mime, tamano: archivo.size, datos: archivo.buffer, dictado: !!opciones.dictado, estado: 'procesando' });
    try {
      if (tipo === 'documento') {
        const { texto, paginas } = await this.extraccion.extraer(archivo.buffer, mime);
        Object.assign(adjunto, { texto: texto || null, paginas });
      } else if (tipo === 'audio') {
        const { texto, duracionSeg } = await this.voz.transcribir(archivo.buffer, mime, nombre);
        Object.assign(adjunto, { texto: texto || null, duracionSeg });
      }
      adjunto.estado = 'listo';
    } catch (e) {
      // el archivo queda guardado aunque no se haya podido leer, y el motivo se muestra
      if (tipo === 'audio') throw e;
      Object.assign(adjunto, { estado: 'error', error: (e as Error).message });
    }
    const guardado = await this.repo.save(adjunto);
    const fragmentos = guardado.texto ? await this.memoria.indexar(guardado) : 0;
    if (tipo === 'imagen') this.describirEnSegundoPlano(guardado);
    return vistaAdjunto(await this.repo.findOneByOrFail({ chatAdjuntoId: guardado.chatAdjuntoId }), fragmentos);
  }

  /** Una imagen no tiene texto: si hay un modelo de visión en Ollama, la describe para poder encontrarla buscando por texto. */
  private describirEnSegundoPlano(adjunto: ChatAdjunto): void {
    this.vision
      .describirImagen(adjunto.datos.toString('base64'))
      .then(async (descripcion) => {
        if (!descripcion) return;
        await this.repo.update(adjunto.chatAdjuntoId, { texto: descripcion });
        await this.memoria.indexar({ ...adjunto, texto: descripcion } as ChatAdjunto);
      })
      .catch((e: Error) => this.logger.warn(`No se pudo describir la imagen «${adjunto.nombre}»: ${e.message}`));
  }

  /**
   * Adjuntos con su texto listo para el agente: si una imagen todavía no tiene descripción (se hace en segundo plano),
   * se describe ahora con el modelo de visión local (como mucho `msMaximo`).
   */
  async conTexto(ids: string[], msMaximo = 90_000): Promise<ChatAdjunto[]> {
    const adjuntos = await this.repo.conDatos(ids);
    if (adjuntos.length !== ids.length) throw new BadRequestException('Alguna evidencia no existe.');
    for (const a of adjuntos.filter((x) => x.tipo === 'imagen' && !x.texto)) {
      try {
        const descripcion = await Promise.race([
          this.vision.describirImagen(a.datos.toString('base64')),
          new Promise<null>((r) => setTimeout(() => r(null), msMaximo)),
        ]);
        if (descripcion) {
          a.texto = descripcion;
          await this.repo.update(a.chatAdjuntoId, { texto: descripcion });
          await this.memoria.indexar(a);
        }
      } catch (e) {
        this.logger.warn(`No se pudo describir «${a.nombre}»: ${(e as Error).message}`);
      }
    }
    return adjuntos;
  }

  async contenido(id: string): Promise<ChatAdjunto> {
    const [a] = await this.repo.conDatos([id]);
    if (!a) throw new NotFoundException('No existe ese archivo.');
    return a;
  }

  /** Solo se borran los que aún no se enviaron (los enviados se van con su conversación). */
  async eliminar(id: string) {
    const [a] = await this.repo.sueltos([id]);
    if (!a) throw new BadRequestException('Ese archivo ya forma parte de un mensaje: se borra con su conversación.');
    await this.repo.remove(a);
    return { eliminado: id };
  }
}

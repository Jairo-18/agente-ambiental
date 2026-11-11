import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { BuscarMemoriaDto, EnviarChatDto } from '../dtos/chat.dto';
import type { ArchivoSubido } from '../services/adjuntos.service';
import { ChatUC } from '../useCases/chat.uc';

/** Tope duro de multer (el límite configurable, CHAT_ADJUNTO_MAX_MB, se revisa después con un mensaje claro). */
const LIMITE_MULTER = { limits: { fileSize: 64 * 1024 * 1024, files: 1 } };
const CUERPO_ARCHIVO = (campo: string) => ({ schema: { type: 'object', properties: { [campo]: { type: 'string', format: 'binary' } } } });
/** Se muestran en el navegador; cualquier otra cosa se descarga (un HTML o SVG subido nunca se ejecuta en la página). */
const EN_LINEA = /^(image\/(png|jpeg|gif|webp)|audio\/[\w.+-]+|application\/pdf)$/;

@Controller('chat')
@ApiTags('Chat')
export class ChatController {
  constructor(private readonly uc: ChatUC) {}

  @Get('proveedores')
  @ApiOperation({ summary: 'Ollama, DeepSeek y Claude: si están disponibles, sus modelos y por qué no, si no lo están' })
  proveedores() {
    return this.uc.proveedores();
  }

  @Get('conversaciones')
  @ApiOperation({ summary: 'Conversaciones del chat, las más recientes primero' })
  listar() {
    return this.uc.listar();
  }

  @Get('conversaciones/:id')
  @ApiOperation({ summary: 'Una conversación con todos sus mensajes y sus adjuntos' })
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.uc.obtener(id);
  }

  @Delete('conversaciones/:id')
  @ApiOperation({ summary: 'Borra una conversación, sus mensajes, sus archivos y sus vectores' })
  eliminar(@Param('id', ParseUUIDPipe) id: string) {
    return this.uc.eliminar(id);
  }

  @Post('mensajes')
  @ApiOperation({ summary: 'Envía un mensaje (con adjuntos opcionales); la respuesta llega en streaming (NDJSON: inicio, texto/razonamiento…, error?, fin)' })
  enviar(@Body() dto: EnviarChatDto, @Res() res: Response) {
    return this.uc.enviar(dto, res);
  }

  @Post('adjuntos')
  @UseInterceptors(FileInterceptor('archivo', LIMITE_MULTER))
  @ApiConsumes('multipart/form-data')
  @ApiBody(CUERPO_ARCHIVO('archivo'))
  @ApiOperation({ summary: 'Sube un archivo (documento, imagen o audio): se guarda en PostgreSQL, se extrae/transcribe su texto y se indexa en pgvector' })
  subir(@UploadedFile() archivo: ArchivoSubido) {
    return this.uc.subirAdjunto(archivo);
  }

  @Get('adjuntos/:id/contenido')
  @ApiOperation({ summary: 'El archivo original (imágenes, audio y PDF se muestran; lo demás se descarga)' })
  async contenido(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const a = await this.uc.contenidoAdjunto(id);
    const enLinea = EN_LINEA.test(a.mime);
    res.setHeader('Content-Type', enLinea ? a.mime : 'application/octet-stream');
    res.setHeader('Content-Disposition', `${enLinea ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.nombre)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // el visor de PDF del navegador no abre un documento con sandbox; para todo lo demás, nada se ejecuta
    if (a.mime !== 'application/pdf') res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(a.datos);
  }

  @Delete('adjuntos/:id')
  @ApiOperation({ summary: 'Quita un archivo que se subió pero aún no se envió' })
  eliminarAdjunto(@Param('id', ParseUUIDPipe) id: string) {
    return this.uc.eliminarAdjunto(id);
  }

  @Get('voz')
  @ApiOperation({ summary: 'Si el reconocimiento de voz (Whisper local) está listo' })
  voz() {
    return this.uc.estadoVoz();
  }

  @Post('voz/transcribir')
  @UseInterceptors(FileInterceptor('audio', LIMITE_MULTER))
  @ApiConsumes('multipart/form-data')
  @ApiBody(CUERPO_ARCHIVO('audio'))
  @ApiOperation({ summary: 'Transcribe una nota de voz con Whisper local; el audio y su texto quedan guardados e indexados' })
  transcribir(@UploadedFile() audio: ArchivoSubido) {
    return this.uc.transcribir(audio);
  }

  @Get('memoria/buscar')
  @ApiOperation({ summary: 'Búsqueda por significado (pgvector) en los archivos, notas de voz e imágenes descritas del chat' })
  buscar(@Query() dto: BuscarMemoriaDto) {
    return this.uc.buscar(dto.q, dto.conversacionId);
  }
}

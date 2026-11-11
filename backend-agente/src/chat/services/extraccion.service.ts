import { BadRequestException, Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import mammoth from 'mammoth';
import { extname } from 'node:path';
import { TipoAdjunto } from '../../shared/entities/chatAdjunto.entity';

/** Imágenes que entienden Claude, DeepSeek y los modelos de visión de Ollama. */
const IMAGENES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** Texto plano: se lee tal cual (notas, datos, código). */
const EXT_TEXTO = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.yaml', '.yml', '.xml', '.html', '.htm', '.css', '.log', '.ini', '.env.example',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.kt', '.c', '.h', '.cpp', '.cs', '.go', '.rs', '.rb', '.php', '.sql', '.sh', '.ps1', '.r', '.ipynb',
]);
const EXT_MIME: Record<string, string> = {
  '.pdf': 'application/pdf', '.docx': DOCX, '.xlsx': XLSX, '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.webm': 'audio/webm', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
};
/** Filas por hoja que se pasan a texto (una hoja enorme no cabe en ningún contexto; la memoria vectorial busca en lo que entra). */
const MAX_FILAS_HOJA = 5000;

export interface Clasificacion {
  tipo: TipoAdjunto;
  /** MIME normalizado (el navegador a veces manda vacío u octet-stream). */
  mime: string;
}

/** Lo que se usa de unpdf (sus tipos son solo ESM y no se resuelven en este proyecto CommonJS). */
interface Unpdf {
  getDocumentProxy(datos: Uint8Array): Promise<unknown>;
  extractText(doc: unknown, opciones: { mergePages: false }): Promise<{ totalPages: number; text: string[] }>;
}

export interface Extraccion {
  texto: string;
  paginas: number | null;
}

/** Qué es un archivo según su MIME o, si el navegador no lo dice, su extensión. Lo que no se sabe leer se rechaza. */
export function clasificar(mimeNavegador: string, nombre: string): Clasificacion {
  const ext = extname(nombre).toLowerCase();
  const mime = (!mimeNavegador || mimeNavegador === 'application/octet-stream' ? EXT_MIME[ext] : mimeNavegador.split(';')[0]) ?? '';
  if (IMAGENES.includes(mime)) return { tipo: 'imagen', mime };
  if (mime.startsWith('audio/') || (mime === 'video/webm' && ext === '.webm')) return { tipo: 'audio', mime: mime.replace('video/', 'audio/') };
  if (mime === 'application/pdf' || mime === DOCX || mime === XLSX) return { tipo: 'documento', mime };
  if (mime.startsWith('text/') || mime === 'application/json' || EXT_TEXTO.has(ext)) return { tipo: 'documento', mime: mime || 'text/plain' };
  throw new BadRequestException(
    `No sé leer «${nombre}». Acepto PDF, Word (.docx), Excel (.xlsx), CSV, texto y código, imágenes (PNG, JPG, GIF, WebP) y audio.`,
  );
}

/** Texto de un documento. Un PDF escaneado devuelve texto vacío (no se hace OCR: Claude sí puede leerlo nativo). */
@Injectable()
export class ExtraccionService {
  async extraer(datos: Buffer, mime: string): Promise<Extraccion> {
    if (mime === 'application/pdf') return this.pdf(datos);
    if (mime === DOCX) return { texto: limpiar((await mammoth.extractRawText({ buffer: datos })).value), paginas: null };
    if (mime === XLSX) return this.excel(datos);
    return { texto: limpiar(datos.toString('utf8').replace(/^﻿/, '')), paginas: null };
  }

  private async pdf(datos: Buffer): Promise<Extraccion> {
    // unpdf solo se distribuye como ESM: import() real (no el require en que TypeScript convierte los import en CommonJS)
    const { getDocumentProxy, extractText } = (await new Function('m', 'return import(m)')('unpdf')) as Unpdf;
    try {
      const doc = await getDocumentProxy(new Uint8Array(datos));
      const { totalPages, text } = await extractText(doc, { mergePages: false });
      const paginas = text.map((t, i) => `[Página ${i + 1}]\n${limpiar(t)}`).filter((t) => !/^\[Página \d+\]\n$/.test(t));
      return { texto: paginas.join('\n\n'), paginas: totalPages };
    } catch (e) {
      throw new BadRequestException(`No pude leer el PDF: ${(e as Error).message}`);
    }
  }

  private async excel(datos: Buffer): Promise<Extraccion> {
    const libro = new Workbook();
    await libro.xlsx.load(datos as unknown as ArrayBuffer);
    const hojas: string[] = [];
    libro.eachSheet((hoja) => {
      const filas: string[] = [];
      hoja.eachRow({ includeEmpty: false }, (fila, n) => {
        if (n > MAX_FILAS_HOJA) return;
        const valores = (fila.values as unknown[]).slice(1).map((v) => celda(v));
        filas.push(valores.join(' | '));
      });
      const recorte = hoja.rowCount > MAX_FILAS_HOJA ? `\n(… ${hoja.rowCount - MAX_FILAS_HOJA} filas más no incluidas)` : '';
      hojas.push(`[Hoja: ${hoja.name}]\n${filas.join('\n')}${recorte}`);
    });
    return { texto: hojas.join('\n\n'), paginas: hojas.length };
  }
}

/** Valor de una celda de exceljs como texto (fórmulas → su resultado, fechas → ISO, enriquecido → texto plano). */
function celda(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: string; richText?: { text: string }[]; hyperlink?: string };
    if (o.result !== undefined) return celda(o.result);
    if (o.richText) return o.richText.map((r) => r.text).join('');
    if (o.text !== undefined) return o.text;
    return JSON.stringify(v);
  }
  return String(v);
}

/** Espacios y saltos de línea normalizados, sin líneas vacías repetidas. */
export function limpiar(t: string): string {
  return t.replace(/\r\n?/g, '\n').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

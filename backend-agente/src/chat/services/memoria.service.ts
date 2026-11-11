import { Injectable, Logger } from '@nestjs/common';
import { OllamaService } from '../../llm/services/ollama.service';
import { ChatAdjunto } from '../../shared/entities/chatAdjunto.entity';
import { ChatAdjuntoRepository } from '../../shared/repositories/chatAdjunto.repository';
import { ChatFragmentoRepository, FragmentoEncontrado } from '../../shared/repositories/chatFragmento.repository';

/** Tamaño objetivo de cada fragmento y cuánto se solapa con el anterior (caracteres). */
const TAMANO = 1000;
const SOLAPE = 150;
/** Textos por llamada a `/api/embed`. */
const LOTE = 16;

/**
 * Parte un texto en fragmentos de ~TAMANO caracteres, cortando en párrafos o frases cuando se puede y repitiendo
 * SOLAPE caracteres entre uno y otro para que una idea partida en dos se encuentre en cualquiera de las dos mitades.
 */
export function fragmentar(texto: string, tamano = TAMANO, solape = SOLAPE): string[] {
  const t = texto.trim();
  if (!t) return [];
  if (t.length <= tamano) return [t];
  const res: string[] = [];
  let inicio = 0;
  while (inicio < t.length) {
    let fin = Math.min(inicio + tamano, t.length);
    if (fin < t.length) {
      // el mejor corte en la segunda mitad del fragmento: párrafo, luego fin de frase, luego espacio
      const ventana = t.slice(inicio + Math.floor(tamano / 2), fin);
      const corte = [ventana.lastIndexOf('\n\n'), ventana.search(/[.!?…]\s[^.!?…]*$/), ventana.lastIndexOf('\n'), ventana.lastIndexOf(' ')].find((i) => i > 0);
      if (corte !== undefined) fin = inicio + Math.floor(tamano / 2) + corte + 1;
    }
    res.push(t.slice(inicio, fin).trim());
    if (fin >= t.length) break;
    inicio = Math.max(fin - solape, inicio + 1);
  }
  return res.filter(Boolean);
}

/**
 * La memoria vectorial del chat: el texto de cada adjunto (documento, transcripción de voz, descripción de imagen)
 * se parte, se convierte en vectores con el modelo de embeddings de la norma (EmbeddingGemma) y se guarda en pgvector.
 */
@Injectable()
export class MemoriaService {
  private readonly logger = new Logger(MemoriaService.name);

  constructor(
    private readonly ollama: OllamaService,
    private readonly adjuntos: ChatAdjuntoRepository,
    private readonly fragmentos: ChatFragmentoRepository,
  ) {}

  /** (Re)indexa un adjunto. Si Ollama no responde, el adjunto queda guardado sin vectores (`indexado: false`). */
  async indexar(adjunto: ChatAdjunto): Promise<number> {
    const trozos = fragmentar(adjunto.texto ?? '');
    try {
      const vectores: number[][] = [];
      for (let i = 0; i < trozos.length; i += LOTE) vectores.push(...(await this.ollama.embeddings(trozos.slice(i, i + LOTE), 'documento')));
      await this.fragmentos.delete({ adjunto: { chatAdjuntoId: adjunto.chatAdjuntoId } });
      if (trozos.length) {
        await this.fragmentos.save(trozos.map((texto, orden) => this.fragmentos.create({ adjunto, orden, texto, embedding: vectores[orden] })), { chunk: 100 });
      }
      await this.adjuntos.update(adjunto.chatAdjuntoId, { indexado: true });
      return trozos.length;
    } catch (e) {
      this.logger.warn(`No se pudo indexar «${adjunto.nombre}»: ${(e as Error).message}`);
      await this.adjuntos.update(adjunto.chatAdjuntoId, { indexado: false });
      return 0;
    }
  }

  /** Vuelve a calcular los vectores de todos los adjuntos con texto (al cambiar de modelo de embeddings). */
  async reindexarTodo(): Promise<{ adjuntos: number; fragmentos: number }> {
    const conTexto = (await this.adjuntos.find()).filter((a) => a.texto);
    let fragmentos = 0;
    for (const a of conTexto) fragmentos += await this.indexar(a);
    return { adjuntos: conTexto.length, fragmentos };
  }

  /** Los fragmentos más parecidos a una pregunta; con `adjuntoIds`, solo en esos adjuntos. */
  async buscar(pregunta: string, limite: number, adjuntoIds?: string[]): Promise<FragmentoEncontrado[]> {
    const [vector] = await this.ollama.embeddings([pregunta], 'consulta');
    return this.fragmentos.buscar(vector, limite, adjuntoIds);
  }
}

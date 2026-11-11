import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { FragmentosService } from '../../conocimiento/services/fragmentos.service';
import { MensajeOllama, OllamaService } from '../../llm/services/ollama.service';
import { ConsultaNormaRepository } from '../../shared/repositories/consultaNorma.repository';
import { Hallazgo, NormaFragmentoRepository } from '../../shared/repositories/normaFragmento.repository';
import { describirProblemasCitas, extraerCitas, verificarConCitas } from '../../verificacion/verificador';

export interface RespuestaNorma {
  pregunta: string;
  respuesta: string;
  /** llm: redactada por el modelo y verificada · extractiva: el modelo no pasó la verificación · sin_resultados */
  origen: 'llm' | 'extractiva' | 'sin_resultados';
  citas: Hallazgo[];
  intentos: number;
  problemas: string[];
}

export const SIN_RESPUESTA = 'No encuentro eso en la base de la norma.';
const MAX_INTENTOS = 3;

const SISTEMA = `Eres un asistente que responde preguntas sobre normativa ambiental colombiana (calidad del aire, ruido, residuos, agua, quemas, tala) y sobre las rutas de atención de reportes ciudadanos en Bogotá, usando EXCLUSIVAMENTE los fragmentos que se te entregan.
Reglas:
1. Responde en español, breve (máximo 4 frases), en texto plano.
2. Después de cada afirmación cita el fragmento con su clave entre corchetes, exactamente como aparece, por ejemplo [LIM-PM10-24H].
3. Usa solo cifras que estén escritas en los fragmentos. No calcules, no conviertas unidades, no redondees.
4. Si los fragmentos no bastan para responder, responde exactamente: ${SIN_RESPUESTA}
5. Si un fragmento está marcado como "supuesto del proyecto", dilo: no es texto de la norma.`;

/**
 * Búsqueda vectorial de la norma (RAG). La Res. 2254/2017 está partida en fragmentos con clave y fuente, indexados en
 * pgvector. El modelo responde solo con los fragmentos que se recuperan y cita cada afirmación; si inventa una cifra o
 * una cita, se rechaza, se reintenta y, al final, responde el código con los fragmentos tal cual.
 */
@Injectable()
export class NormaService {
  private readonly log = new Logger('Norma');

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly fragmentos: FragmentosService,
    private readonly ollama: OllamaService,
    private readonly repo: NormaFragmentoRepository,
    private readonly consultas: ConsultaNormaRepository,
  ) {}

  async estado() {
    return { ...(await this.repo.estado()), modeloEmbeddings: this.config.get('ollama', { infer: true }).embeddingModel };
  }

  /** Calcula los embeddings de los fragmentos de la base de conocimiento y los guarda en pgvector (idempotente). */
  async indexar(): Promise<{ indexados: number }> {
    const fragmentos = this.fragmentos.construir();
    const textos = fragmentos.map((f) => `${f.titulo}. ${f.texto}`);
    const vectores: number[][] = [];
    for (let i = 0; i < textos.length; i += 16) vectores.push(...(await this.ollama.embeddings(textos.slice(i, i + 16), 'documento')));
    const indexados = await this.repo.reemplazarTodos(fragmentos, vectores);
    this.log.log(`${indexados} fragmentos indexados`);
    return { indexados };
  }

  /**
   * ¿Hay que reindexar? Sí si el índice está vacío, si cambió el número de fragmentos (se editó la base de conocimiento)
   * o si cambió el modelo de embeddings: se vuelve a embeber un fragmento conocido y se compara con el guardado
   * (con el mismo modelo la similitud es ~1; con otro, mucho menor). No hace falta guardar el nombre del modelo.
   */
  async motivoParaReindexar(): Promise<string | null> {
    const { fragmentos } = await this.repo.estado();
    const esperados = this.fragmentos.construir();
    if (fragmentos === 0) return 'el índice está vacío';
    if (fragmentos !== esperados.length) return `la base tiene ${esperados.length} fragmentos y el índice ${fragmentos}`;
    const muestra = esperados[0];
    const [fila] = await this.repo.query(`SELECT 1 - ("embedding" <=> $1::vector) AS "similitud" FROM "NormaFragmento" WHERE "clave" = $2`, [
      `[${(await this.ollama.embeddings([`${muestra.titulo}. ${muestra.texto}`], 'documento'))[0].join(',')}]`, muestra.clave,
    ]);
    if (!fila || Number(fila.similitud) < 0.98) return `cambió el modelo de embeddings (similitud de control ${fila ? Number(fila.similitud).toFixed(3) : 'sin fila'})`;
    return null;
  }

  /** Los k fragmentos más parecidos a la consulta (distancia coseno de pgvector). */
  async buscar(consulta: string, k = 5): Promise<Hallazgo[]> {
    const [vector] = await this.ollama.embeddings([consulta], 'consulta');
    return this.repo.masCercanos(vector, k);
  }

  async preguntar(pregunta: string): Promise<RespuestaNorma> {
    if ((await this.repo.estado()).fragmentos === 0) {
      throw new ConflictException('El índice de la norma está vacío. Indexa la norma primero (POST /api/norma/indexar).');
    }
    const minimo = this.config.get('ollama', { infer: true }).similarityMin;
    const encontrados = (await this.buscar(pregunta, 5)).filter((h) => h.similitud >= minimo);
    const resultado: RespuestaNorma = encontrados.length
      ? await this.redactar(pregunta, encontrados)
      : { pregunta, respuesta: SIN_RESPUESTA, origen: 'sin_resultados', citas: [], intentos: 0, problemas: [] };
    await this.consultas.save(
      this.consultas.create({
        pregunta, respuesta: resultado.respuesta, origen: resultado.origen, citas: resultado.citas.map((c) => c.clave), intentos: resultado.intentos,
      }),
    );
    return resultado;
  }

  /** El modelo redacta con los fragmentos; si cita mal o inventa cifras se reintenta y, al final, responde el código. */
  async redactar(pregunta: string, hallazgos: Hallazgo[]): Promise<RespuestaNorma> {
    const claves = hallazgos.map((h) => h.clave);
    const fuentes = [pregunta, ...hallazgos.flatMap((h) => [h.texto, h.titulo])];
    const contexto = hallazgos
      .map((h) => `[${h.clave}] ${h.titulo} (${h.fuente}; ${h.verificado ? 'texto de la norma' : 'supuesto del proyecto'})\n${h.texto}`)
      .join('\n\n');
    const mensajes: MensajeOllama[] = [
      { role: 'system', content: SISTEMA },
      { role: 'user', content: `Fragmentos:\n\n${contexto}\n\nPregunta: ${pregunta}` },
    ];
    const problemas: string[] = [];
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      const texto = await this.ollama.chat(mensajes, 0.1);
      if (texto.includes(SIN_RESPUESTA)) return { pregunta, respuesta: SIN_RESPUESTA, origen: 'sin_resultados', citas: [], intentos: intento, problemas };
      const v = verificarConCitas(texto, fuentes, claves);
      if (v.ok) {
        const citadas = new Set(extraerCitas(texto));
        return { pregunta, respuesta: texto, origen: 'llm', citas: hallazgos.filter((h) => citadas.has(h.clave)), intentos: intento, problemas };
      }
      const problema = describirProblemasCitas(v);
      problemas.push(problema);
      mensajes.push(
        { role: 'assistant', content: texto },
        { role: 'user', content: `Tu respuesta fue rechazada: ${problema}. Corrígela usando solo los fragmentos y cita cada afirmación con [CLAVE].` },
      );
    }
    return this.extractiva(pregunta, hallazgos, problemas);
  }

  /** Último recurso: los fragmentos más relevantes tal cual, sin pasar por el modelo. */
  extractiva(pregunta: string, hallazgos: Hallazgo[], problemas: string[]): RespuestaNorma {
    const top = hallazgos.slice(0, 3);
    return { pregunta, respuesta: top.map((h) => `${h.texto} [${h.clave}]`).join('\n\n'), origen: 'extractiva', citas: top, intentos: MAX_INTENTOS, problemas };
  }
}

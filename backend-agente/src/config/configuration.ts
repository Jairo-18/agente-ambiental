import { join } from 'node:path';

const entero = (valor: string | undefined, porDefecto: number): number => {
  const n = Number(valor);
  return valor !== undefined && valor !== '' && Number.isFinite(n) ? n : porDefecto;
};

/**
 * Configuración tipada, leída del entorno. Los valores por defecto sirven para correr todo en este PC
 * (`npm run start:dev` con la base de `docker compose up -d db`); en Docker se sobreescriben por variables.
 */
export const configuration = () => ({
  app: {
    port: entero(process.env.PORT, 4000),
    host: process.env.HOST ?? '127.0.0.1',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://127.0.0.1:3100,http://localhost:3100').split(',').map((o) => o.trim()),
  },
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: entero(process.env.DB_PORT, 5433),
    username: process.env.DB_USERNAME ?? 'agente',
    password: process.env.DB_PASSWORD ?? 'agente_local',
    database: process.env.DB_DATABASE ?? 'agente_ambiental',
  },
  storage: {
    /** Base de conocimiento (YAML de la norma, estaciones, esquema). Versionada con el código. */
    knowledgeDir: process.env.KNOWLEDGE_DIR ?? join(process.cwd(), 'knowledge'),
    /** Archivos de datos de entrada (CSV en formato estándar, Excel de la RMCAB). */
    dataDir: process.env.DATA_DIR ?? join(process.cwd(), 'data'),
    /** Reportes generados: una carpeta `AAAA-MM_aire` por periodo. */
    reportsDir: process.env.REPORTS_DIR ?? join(process.cwd(), 'storage', 'reports'),
  },
  ollama: {
    url: (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, ''),
    chatModel: process.env.OLLAMA_CHAT_MODEL ?? 'qwen2.5:14b',
    /** EmbeddingGemma (Google, 308M, 768 dim.), el que pide el curso; nomic-embed-text también sirve (mismas dimensiones). */
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL ?? 'embeddinggemma',
    /** Debe coincidir con vector(N) de la entidad NormaFragmento. */
    embeddingDimensions: 768,
    /**
     * Similitud coseno mínima para considerar que un fragmento responde a la pregunta. Medida con EmbeddingGemma
     * sobre esta base (68 fragmentos, 2026-11-10): 12 preguntas pertinentes 0.46-0.75 (la respuesta correcta siempre
     * en el top 5); 6 sin relación 0.06-0.15. Con nomic-embed-text la escala era otra (0.69-0.86 vs 0.60; umbral 0.65).
     */
    similarityMin: Number(process.env.SIMILARITY_MIN ?? 0.3),
  },
  /** Chat libre (pantalla "Chat"): además de Ollama, DeepSeek por API y Claude con la suscripción del usuario. */
  chat: {
    deepseek: {
      /** API compatible con OpenAI. Sirve también OpenRouter (https://openrouter.ai/api/v1) con modelos `:free`. */
      url: (process.env.DEEPSEEK_URL ?? 'https://api.deepseek.com').replace(/\/$/, ''),
      apiKey: process.env.DEEPSEEK_API_KEY ?? '',
      /** Si se deja vacío, la lista de modelos se pide a `GET /models`. */
      modelos: (process.env.DEEPSEEK_MODELS ?? '').split(',').map((m) => m.trim()).filter(Boolean),
      /** Tope de la respuesta. Sin él, OpenRouter reserva crédito para el máximo del modelo (131k tokens) y rechaza con poco saldo. */
      maxTokens: entero(process.env.DEEPSEEK_MAX_TOKENS, 8000),
    },
    claude: {
      /** Ejecutable de Claude Code; usa la sesión iniciada (`claude auth login`) o CLAUDE_CODE_OAUTH_TOKEN (`claude setup-token`). */
      cli: process.env.CLAUDE_CLI ?? '',
      /** Para limitar el catálogo (ids separados por coma); vacío = todos los de `llm/constants/modelos-claude.ts`. */
      modelos: (process.env.CLAUDE_MODELS ?? '').split(',').map((m) => m.trim()).filter(Boolean),
      modeloPorDefecto: process.env.CLAUDE_MODELO_POR_DEFECTO ?? 'claude-opus-5-5',
    },
    /** Cuántos mensajes anteriores de la conversación se le mandan al modelo. */
    historialMaximo: entero(process.env.CHAT_HISTORIAL_MAXIMO, 40),
    /** Tamaño máximo de un archivo adjunto o de una grabación (MB). Se guardan en PostgreSQL. */
    adjuntoMaxMb: entero(process.env.CHAT_ADJUNTO_MAX_MB, 20),
  },
  /** Voz a texto: Whisper local (contenedor `stt`, Speaches) con la API de OpenAI. */
  stt: {
    url: (process.env.STT_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, ''),
    /** large-v3-turbo: casi la calidad de large-v3 en español, mucho más rápido (~1,6 GB de VRAM). */
    modelo: process.env.STT_MODEL ?? 'deepdml/faster-whisper-large-v3-turbo-ct2',
    idioma: process.env.STT_IDIOMA ?? 'es',
  },
  /** Texto a voz: Kokoro (mismo contenedor `stt`, Speaches) con voces en español. Elegido por una prueba de ida y vuelta con Whisper. */
  tts: {
    modelo: process.env.TTS_MODEL ?? 'speaches-ai/Kokoro-82M-v1.0-ONNX-fp16',
    voz: process.env.TTS_VOZ ?? 'ef_dora',
    voces: (process.env.TTS_VOCES ?? 'ef_dora,em_alex,em_santa').split(',').map((v) => v.trim()).filter(Boolean),
  },
});

export type AppConfig = ReturnType<typeof configuration>;

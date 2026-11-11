# Agente ambiental para reportes ciudadanos — Bogotá

Proyecto del curso **Sistemas Expertos — UniPutumayo, Agentes de IA** · Agente n.° 5, *Agente ambiental para reportes
ciudadanos* (sector Ambiental) · Jhon Legarda.

Un agente conversacional **local** (texto y voz) que recibe reportes ambientales de ciudadanos de Bogotá —basura y escombros,
tala, quemas, ruido, humo u olores, ríos/quebradas/humedales—, los clasifica, les asigna prioridad y radicado, dice a qué
entidad le corresponden y por qué canal oficial ponerlos, y responde por voz. Un funcionario los sigue en un tablero.
También genera el **reporte mensual de calidad del aire** con datos de la RMCAB y la Resolución 2254 de 2017.

> El radicado que entrega el agente es interno de este prototipo académico, **no es un radicado oficial** de la Secretaría
> Distrital de Ambiente. El agente siempre indica los canales oficiales para radicar de verdad.

## Arquitectura

```
audio del ciudadano ─► STT (Whisper) ─► agente (qwen2.5:14b + 8 herramientas fijas)
                                          │   reglas en código: tipo, prioridad, emergencia, entidad
                                          ├─► PostgreSQL: reportes, historial, evidencias (fotos/audios)
                                          ├─► pgvector (EmbeddingGemma): normativa, rutas de atención, duplicados
                                          ▼
                       respuesta ─► TTS (Kokoro) ─► voz y texto
```

**El modelo de lenguaje no decide nada normativo ni numérico**: entiende la petición, extrae los datos y propone el tipo;
la clasificación final, la prioridad, la emergencia y la entidad las decide el código con las reglas de
`backend-agente/knowledge/reportes_ciudadanos_bogota.yaml`. Antes de guardar, una persona confirma. Todo corre en el PC.

| Pieza | Tecnología |
|---|---|
| Backend | NestJS 11 + TypeScript + TypeORM (migraciones) |
| Base de datos | PostgreSQL 16 + **pgvector** (índices HNSW de coseno) |
| Frontend | Next.js 16 (React 19) |
| LLM | Ollama: `qwen2.5:14b` (agente), `qwen2.5vl:7b` (describe fotos de evidencia) |
| Embeddings | **EmbeddingGemma** (`embeddinggemma`, 768 dim.) |
| STT / TTS | Speaches en GPU: **Whisper** large-v3-turbo / **Kokoro** (voz `ef_dora`) |
| Orquestación | Docker Compose: `db`, `backend-agente`, `frontend-agente`, `stt` |

## Cómo levantarlo

**Requisitos**: Docker Desktop (con soporte de GPU NVIDIA para el contenedor de voz), Ollama en el PC y ~20 GB libres.

```powershell
# 1. Modelos de Ollama (fuera de Docker, para usar la GPU)
ollama pull qwen2.5:14b
ollama pull embeddinggemma
ollama pull qwen2.5vl:7b        # opcional: describir fotos de evidencia
ollama serve

# 2. (Opcional) claves del chat libre: DeepSeek / Claude
copy .env.example .env

# 3. Todo el sistema (la primera vez tarda: construye imágenes y descarga la de voz, ~9 GB)
docker compose up --build -d
docker compose ps               # los cuatro "Up"; db, backend y stt "healthy"
```

Abre **http://localhost:3100**. La primera vez el backend crea las tablas (migraciones), indexa la normativa en pgvector y el
contenedor de voz descarga Whisper y Kokoro (unos minutos). API y Swagger: http://localhost:4000/docs.

| Pantalla | Para qué |
|---|---|
| **Agente (reportes)** | Reportar por texto o 🎤 voz, adjuntar fotos 📎, escuchar la respuesta 🔊 |
| **Reportes ciudadanos** | Tablero del funcionario: filtros, detalle, evidencias, historial, cambio de estado |
| Calidad del aire · Evaluar un valor · Consultar la norma | Reporte mensual RMCAB y norma del aire |
| Chat | Chat libre con Ollama, DeepSeek o Claude (con archivos y voz) |

## Pruebas y evaluación

```powershell
cd backend-agente
npm install
npm test               # 313 pruebas unitarias (sin red ni base de datos)
npm run test:db        # 25 de extremo a extremo contra PostgreSQL + pgvector reales (requiere `docker compose up -d db`)
npm run evaluar        # evaluación del agente con 38 casos reales (requiere el sistema completo en marcha)
```

Resultados de la evaluación (texto y voz, `backend-agente/evaluacion/RESULTADOS.md`): tipo 27/27, prioridad 26/27,
emergencias 27/27, preguntas sin registrar 5/5, error de la voz (WER) 4,3 %, latencia mediana 4,5 s; 7 de 8 en casos de
generalización que no se usaron para ajustar.

## Estructura

```
backend-agente/    API NestJS: reportes-ciudadanos/, asistente/ (agente), chat/, norma/ (RAG), llm/ (Ollama, voz)…
  knowledge/       base de conocimiento en YAML (normativa y canales con su fuente)
  evaluacion/      casos de prueba, script y resultados
frontend-agente/   Next.js
docker-compose.yml
CONTEXTO.md        documentación completa: decisiones, datos, guardas, fallos reales del modelo, pendientes
```

## Límites y consideraciones éticas

- Prototipo académico: no reemplaza los canales oficiales; ante peligro siempre indica llamar al **123**.
- La escala de prioridad es un **criterio del proyecto**, no un protocolo oficial. Algunos artículos de la Ley 1801 y el
  Decreto 1076 están transcritos como resúmenes marcados como pendientes de verificar contra el texto oficial.
- Privacidad: el contacto del ciudadano es opcional (puede reportar anónimo); voz, fotos y conversación no salen del PC.
- Trazabilidad: cada reporte guarda qué propuso el modelo, qué dieron las reglas, por qué tiene su prioridad y su historial.

Detalle completo en [`CONTEXTO.md`](CONTEXTO.md).

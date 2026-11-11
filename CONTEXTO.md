# Contexto del proyecto — Agente ambiental para reportes ciudadanos (Bogotá)

> Para quien continúe este proyecto (persona o asistente de IA): léelo completo antes de tocar nada.
> Última actualización: 2026-11-10. Proyecto de curso (Sistemas Expertos) de Jhon Legarda. Idioma de todo: **español**.
> Esta carpeta es **todo** el proyecto: `backend-agente/`, `frontend-agente/`, `docker-compose.yml`, `.env` (secretos del chat, no se comparte)
> y este archivo. En la carpeta padre hay otras dos cosas que no son de aquí y no se tocan: `telegram-bot/` y `ollama-acceso-remoto.md`.
> (Hasta el 2026-11-10 las carpetas se llamaban `backend/` y `frontend/`.)

## 1. Qué es

Es el **agente n.° 5 del curso "UniPutumayo – Agentes de IA"**: *Agente ambiental para reportes ciudadanos* (sector Ambiental,
a nombre de Jhon Legarda). El enunciado pide: recibir y clasificar reportes de basura, tala, quemas, ruido, contaminación y
fuentes hídricas; PostgreSQL con reportes, ubicación, fecha, evidencia, clasificación, prioridad y estado; pgvector con protocolos,
normativa y rutas de atención; embeddings **EmbeddingGemma**; **STT** (faster-whisper) y **TTS** (Kokoro/Piper); interfaz web con
texto y audio; y evaluación con casos de prueba concretos. Arquitectura: audio → STT → agente/LLM → PostgreSQL + pgvector →
respuesta → TTS. **Territorio: Bogotá D.C.** (decisión del 2026-11-10: hay más volumen de reportes que en Mocoa y el proyecto ya
tenía los datos y la norma de Bogotá); autoridad ambiental, la Secretaría Distrital de Ambiente (SDA).

Hace dos cosas, todo local en el PC (Ollama, Whisper, Kokoro y la base corren aquí):
1. **Reportes ciudadanos** (§7d): el ciudadano cuenta por texto o voz (con fotos o audios de evidencia) qué pasa y dónde; el agente
   pide lo que falta, registra con confirmación humana, da un radicado, la prioridad, la entidad responsable y los canales oficiales,
   y lo lee en voz alta. Un funcionario lo sigue en el tablero `/reportes-ciudadanos`.
2. **Reporte mensual de calidad del aire** (datos de la RMCAB, **Resolución 2254 de 2017**), lo que el proyecto hacía primero.

La idea que lo ordena todo: **el modelo de lenguaje no decide nada normativo ni numérico.**

| Lo hace el código determinista (TypeScript) | Lo hace el LLM (Ollama, `qwen2.5:14b`) |
|---|---|
| Leer datos, QA/QC, promedios, representatividad | Entender la petición y elegir una herramienta |
| Evaluar contra la norma (motor de reglas generado desde YAML) | Redactar párrafos que *describen* concentraciones |
| Decidir excedencias, niveles y series no evaluables | Redactar respuestas sobre la norma citando fragmentos |
| Generar el Word, los gráficos y la trazabilidad | |

Cada texto del modelo pasa por **verificadores en código**; si fallan, escribe una plantilla o el propio código.
En los reportes ciudadanos igual: **el tipo final, la prioridad, la emergencia y la entidad las decide el código** con las reglas del
YAML (el modelo solo propone el tipo y extrae los datos), y la respuesta tras registrar la escribe el código.

Aparte, la pantalla **Chat** (`/chat`) es un chat libre, **sin verificadores**, con el modelo que se elija: Ollama (local),
DeepSeek (API) o Claude (con la suscripción del usuario). Ver §7b.

## 2. Stack

| Pieza | Tecnología |
|---|---|
| Backend | **NestJS 11 + TypeScript + TypeORM 1.x**, organizado por módulos como `C:\Trabajo\hoteles-putumayo\backend-hotel` (controllers / useCases / services / dtos, `shared/` con entidades y repositorios, migraciones, validación de entorno que falla al arrancar) |
| Base de datos | **PostgreSQL 16 + pgvector** (imagen `pgvector/pgvector:pg16`) |
| Frontend | **Next.js 16** (App Router, React 19), proxy `/api/*` → backend |
| Modelo | Ollama en el PC: `qwen2.5:14b` (agente y chat), **`embeddinggemma`** (EmbeddingGemma 308M, 768 dim.; antes `nomic-embed-text`) y `qwen2.5vl:7b` (visión: chat libre y descripción de fotos de evidencia) |
| Voz | Contenedor `stt` (Speaches, GPU): **STT** Whisper `deepdml/faster-whisper-large-v3-turbo-ct2` y **TTS** Kokoro `speaches-ai/Kokoro-82M-v1.0-ONNX-fp16` (voz `ef_dora`; también `em_alex`, `em_santa`) |
| Chat libre | Ollama · DeepSeek por su API (compatible con OpenAI) · Claude ejecutando **Claude Code** (`claude -p`, sin herramientas) con la suscripción |
| Word y gráficos | librería `docx`; gráficos dibujados como SVG y pasados a PNG con `@resvg/resvg-js` (sin matplotlib ni navegador) |
| Orquestación | **Docker Compose**: `db`, `backend-agente`, `frontend-agente`, `stt` (voz, con GPU) |

## 3. Cómo se levanta

### Con Docker (lo normal)

Requisitos: **Docker Desktop abierto**, y **Ollama corriendo en el PC** (`ollama serve`) con los modelos `qwen2.5:14b` y `nomic-embed-text`
(`ollama pull ...`). Ollama no va en Docker a propósito: así aprovecha la GPU.

```powershell
docker compose up --build -d     # construye y levanta db + backend + frontend (la 1.ª vez tarda unos minutos)
docker compose ps                # los tres deben salir "Up"; db y backend "healthy"
docker compose logs -f backend-agente   # registro del backend
docker compose down              # apaga todo; los datos se conservan en el volumen agente_ambiental_pgdata
```

Luego abre **http://127.0.0.1:3100**. API y Swagger: **http://127.0.0.1:4000/docs**. Todo se publica solo en `127.0.0.1`.

| Servicio | Puerto en el PC | Nota |
|---|---|---|
| frontend-agente | 3100 | lo que usas |
| backend-agente | 4000 | API `/api/*` y Swagger `/docs` |
| db | 5433 | el 5432 suele estar ocupado por otro Postgres del PC; usuario `agente`, base `agente_ambiental` |
| Ollama | 11434 | fuera de Docker; el backend lo alcanza por `host.docker.internal` |
| stt (Whisper) | 8000 | contenedor `stt-agente` con la RTX 3060 (`deploy.resources…gpu`); el backend entra por `http://stt:8000` |

Al arrancar, el backend aplica solo las **migraciones de TypeORM**, importa a la base los reportes que ya haya en `backend-agente/storage/reports/` e
indexa la norma en pgvector si el índice está vacío (si Ollama no está arriba, usa el botón *Reindexar* de la pantalla "Consultar la norma").
La esquina superior derecha de la UI muestra qué pieza falta (`GET /api/salud` da lo mismo).

Volúmenes de trabajo (carpetas del proyecto montadas en el contenedor): `backend-agente/data` (archivos de entrada, solo lectura) y
`backend-agente/storage/reports` (reportes generados).

### Desarrollo sin Docker para el backend y el frontend

```powershell
docker compose up -d db                       # solo la base
cd backend-agente  ; copy .env.example .env ; npm install ; npm run start:dev      # API en :4000 (o: npm run build ; npm start)
cd frontend-agente ; npm install ; npm run dev                                      # UI en :3100 (reenvía /api a http://127.0.0.1:4000)
```

Si el backend corre en el PC, **detén el contenedor del backend** (comparten el puerto 4000): `docker compose stop backend-agente frontend-agente`.

### Si algo falla

- *"Backend sin respuesta" / chip rojo de PostgreSQL*: la base no está arriba (`docker compose ps`) o el `.env` apunta a otro puerto (5433).
- *Chip rojo de Ollama* o respuestas del modelo con error 503: `ollama serve` no está corriendo. Desde Docker se llega por `host.docker.internal:11434`.
- *Puerto ocupado* (3000, 5432, 4000): ya hay otro proyecto en el PC usándolo; por eso se eligieron 3100 y 5433.

## 4. Estructura de carpetas

```
agente-ambiental/
├─ CONTEXTO.md  docker-compose.yml
├─ backend-agente/                         NestJS + TypeORM
│   ├─ Dockerfile  .env.example  typeorm.config.ts (DataSource de la CLI)  package.json  jest*.config.js  tsconfig*.json
│   ├─ knowledge/                    la norma como datos: aire_res2254_2017.yaml, estaciones_rmcab.yaml, esquema_reporte_aire_mensual.yaml
│   ├─ data/                         archivos de entrada: rmcab_2026-10_largo.csv, el Excel original de la RMCAB y su README (procedencia)
│   ├─ storage/reports/              reportes generados (una carpeta AAAA-MM_aire por mes)
│   ├─ test/                         app.db-spec.ts (extremo a extremo), fixtures/golden-hechos-2026-10.json, helpers/
│   └─ src/
│       ├─ main.ts  app.module.ts  arranque.service.ts
│       ├─ config/        configuracion tipada + validación de entorno (falla al arrancar si falta algo)
│       ├─ database/      database.config.ts + migrations/ (esquema versionado)
│       ├─ shared/        constants/ entities/ (9) repositories/ (6) interfaces/ utils/ shared.module.ts
│       ├─ conocimiento/  carga el YAML de la norma y lo parte en fragmentos para la búsqueda vectorial
│       ├─ normativa/     conversión de unidades y motor de reglas
│       ├─ datos/         lee CSV y el Excel crudo de la RMCAB (solo archivos de la carpeta de datos)
│       ├─ analisis/      QA/QC, series y promedios, y construcción de `hechos` (todo lo que el reporte puede afirmar)
│       ├─ verificacion/  verificadores de cifras, comparaciones, citas y nombres de archivo (funciones puras)
│       ├─ llm/           cliente de Ollama (chat, herramientas, embeddings), los 3 proveedores del chat libre (Ollama, DeepSeek, Claude CLI) y la voz (Whisper)
│       ├─ redaccion/     plantillas del código y prosa del modelo bajo verificación
│       ├─ reportes/      orquesta y guarda el reporte: Word, gráficos, trazabilidad, disco y base
│       ├─ evaluaciones/  "¿este valor cumple la norma?" con registro de auditoría
│       ├─ norma/         RAG: pgvector + respuestas con citas verificadas
│       ├─ asistente/     el agente (6 herramientas fijas), sus guardas y la conversación guardada
│       ├─ chat/          chat libre multiproveedor en streaming (NDJSON): conversaciones, adjuntos, voz, memoria vectorial y armado del contexto
│       ├─ trabajos/      operaciones largas en segundo plano
│       └─ salud/         estado de backend, base y Ollama
└─ frontend-agente/                  Next.js: app/{page, reportes/[periodo], valor, norma, asistente, chat}  components/{chat/: BarraLateral, SelectorModelo, SelectorEsfuerzo, Compositor, Mensaje}  lib/{api,chat,useChatLibre}.ts  Dockerfile
```

Cada módulo de negocio sigue el patrón de hoteles-putumayo: `controllers/` (HTTP) → `useCases/` (orquestación fina) → `services/`
(lógica) → `shared/repositories/` (TypeORM), con `dtos/` validados por `class-validator` (`whitelist` + `forbidNonWhitelisted`).

## 5. API (todo bajo `/api`, documentada en `/docs`)

| Ruta | Qué hace |
|---|---|
| `GET /datos` · `POST /reportes/revisar` | archivos disponibles · QA/QC y representatividad de un archivo y mes (no escribe nada) |
| `POST /reportes/generar` | `202` + `trabajoId`; si el mes ya tiene reporte pide `confirmado: true` (y guarda una **versión** nueva) |
| `GET /reportes` · `/reportes/:periodo` · `/reportes/:periodo/versiones` · `/reportes/:periodo/archivos/:nombre` | listado, último reporte, versiones, descarga (lista **cerrada**: reporte.docx, trazabilidad.md, hechos.json, 3 PNG) |
| `GET /analitica` | resumen entre reportes con SQL (excedencias, series no evaluables) |
| `POST /evaluaciones` · `GET /evaluaciones` | evalúa un valor contra la norma y lo registra · historial |
| `GET /norma/estado` · `POST /norma/indexar` · `GET /norma/buscar` · `POST /norma/preguntar` | RAG sobre pgvector |
| `POST /asistente/mensajes` (`202`) · `GET /asistente/historial` · `GET /asistente/pendiente` · `POST /asistente/confirmar` · `POST /asistente/nueva` | chat con el agente y su confirmación humana |
| `GET /chat/proveedores` · `POST /chat/mensajes` (**streaming**) · `GET /chat/conversaciones` · `GET`/`DELETE /chat/conversaciones/:id` | chat libre (§7b) |
| `POST /chat/adjuntos` · `GET /chat/adjuntos/:id/contenido` · `DELETE /chat/adjuntos/:id` · `GET /chat/voz` · `POST /chat/voz/transcribir` · `GET /chat/memoria/buscar?q=` | archivos, voz y búsqueda por significado (§7c) |
| `GET /trabajos/:id` · `GET /salud` | estado de una operación larga · estado de las piezas |

Generar un reporte y chatear con el agente pueden tardar minutos: corren como **trabajos en segundo plano** (una operación pesada a la vez, `409` si hay otra).
El chat libre no usa trabajos: responde en streaming en la misma petición.

## 6. Base de datos (TypeORM + migraciones)

Tablas (nombres en PascalCase como hoteles-putumayo): `Reporte` (cada generación es una **versión**; `detalle` JSONB listo para la UI),
`Excedencia`, `Serie`, `AdvertenciaQaqc` (desglose relacional, `ON DELETE CASCADE`), `Evaluacion` (auditoría), `Conversacion` + `Mensaje`
(chat del agente), `NormaFragmento` (**`embedding vector(768)`** + índice HNSW de coseno), `ConsultaNorma` (auditoría del RAG),
`ChatConversacion` + `ChatMensaje` (chat libre; migraciones `ChatLibre` y `ChatEsfuerzo`; cada mensaje guarda proveedor, modelo, esfuerzo, duración, razonamiento y error),
`ChatAdjunto` (el archivo o la nota de voz **en `bytea`** + su texto) y `ChatFragmento` (**`embedding vector(768)`** + índice HNSW de coseno hecho a mano; migración `ChatAdjuntosMemoria`).
Borrar una conversación borra en cascada sus mensajes, adjuntos y vectores.
`synchronize` está **apagado**: el esquema lo manejan las migraciones, que se aplican al arrancar (`migrationsRun`).

```powershell
cd backend-agente
npm run migration:generate -- src/database/migrations/NombreDelCambio   # compara las entidades con la base y genera la migración
npm run migration:run     # aplica pendientes (la aplicación ya lo hace sola al arrancar)
npm run migration:revert
```

Notas de TypeORM 1.x: la columna `vector` es nativa; los UUID usan `pgcrypto` (`uuidExtension` en `typeorm.config.ts` y `database.config.ts`);
**los índices HNSW (NormaFragmento y ChatFragmento) están escritos a mano en las migraciones** porque TypeORM no sabe describirlos (una prueba comprueba que es lo único que difiere).
Todo lo guardado es regenerable: los reportes se reimportan de `storage/reports/` y la norma se reindexa.

## 7. Búsqueda vectorial de la norma (RAG)

1. `conocimiento/` convierte el YAML en **39 fragmentos** con clave estable (`LIM-PM10-24H`, `NIV-NO2-1H`, `ICA-151-200`, `CONV-O3`…), tipo, fuente y `verificado` (lo provisional va marcado *supuesto del proyecto*).
2. `norma/` los embebe con `nomic-embed-text` y los guarda en pgvector (`POST /norma/indexar`, idempotente; borra los que ya no existen).
3. `POST /norma/preguntar` recupera los 5 más cercanos, descarta los de similitud < **0,65** (medido: una pregunta sin relación llega a 0,60 y las pertinentes a 0,69–0,86) y el modelo responde **solo con ellos, citando `[CLAVE]`**.
4. Verificador: toda cifra debe estar en los fragmentos o en la pregunta y toda cita debe ser un fragmento recuperado. 3 intentos con realimentación; si falla, responde el código con los fragmentos tal cual (`origen: extractiva`).
5. El agente lo usa como herramienta `consultar_norma`.

## 7b. Chat libre (`/chat`): Ollama, DeepSeek y Claude

Chat general (no sabe del proyecto ni tiene verificadores) para conversar con el modelo que se elija. Barra lateral con las conversaciones
guardadas, selector de proveedor y modelo, respuesta en streaming con botón **Detener** (lo que alcanzó a llegar se guarda), Markdown,
razonamiento plegable (DeepSeek y modelos *thinking* de Ollama) e instrucciones opcionales por conversación. Se puede cambiar de proveedor
a mitad de una conversación: el historial (últimos `CHAT_HISTORIAL_MAXIMO` = 40 mensajes) se le pasa al que responda.

| Proveedor | Cómo se conecta | Qué hace falta |
|---|---|---|
| **Ollama** | `/api/chat` con `stream: true` | `ollama serve`; lista los modelos instalados (sin los de embeddings) |
| **DeepSeek** | `POST {DEEPSEEK_URL}/chat/completions` (SSE, compatible con OpenAI) con `max_tokens` = `DEEPSEEK_MAX_TOKENS` (8000) | **Hoy va por OpenRouter** (`DEEPSEEK_URL=https://openrouter.ai/api/v1`, key de OpenRouter, `DEEPSEEK_MODELS` = 4 modelos de DeepSeek). La key directa de DeepSeek no tiene saldo (0,00 USD el 2026-11-10). En OpenRouter no hay DeepSeek `:free`: cobra centavos; sin `max_tokens` reserva 131k tokens y rechaza con poco crédito |
| **Claude** | ejecuta Claude Code: `claude -p --output-format stream-json --tools "" --strict-mcp-config --setting-sources "" --no-session-persistence --model <id> [--effort <nivel>]` | En el PC: la sesión de `claude auth login`. En Docker: `claude setup-token` y pegar el token en `CLAUDE_CODE_OAUTH_TOKEN` del `.env` de la raíz (hecho el 2026-11-10; dura ~1 año) |

- Claude usa el **cupo de la suscripción** (el mismo de claude.ai y Claude Code); catálogo de **11 modelos** en `llm/constants/modelos-claude.ts` (Más recientes: Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 4.5; Anteriores: Fable 5, Opus 5/4.8/4.7/4.6, Sonnet 5/4.6), todos comprobados con el plan Pro el 2026-11-10; por defecto Opus 5.5 (`CLAUDE_MODELO_POR_DEFECTO`; `CLAUDE_MODELS` limita la lista). `claude -p` recibe un solo texto: con historial, la conversación va transcrita en el prompt. Es para **uso personal**: no exponer esta API a otras personas.
- **Capacidad (esfuerzo)**: cada modelo declara sus niveles (`low`, `medium`, `high`, `xhigh`, `max`, en pantalla Baja…Máx) y uno por defecto (`medium`). Claude: `--effort` del CLI (Haiku 4.5 y Ollama no tienen niveles; Opus/Sonnet 4.6 no tienen `xhigh`). DeepSeek vía OpenRouter: `reasoning.effort`, solo en los modelos que anuncian `reasoning_effort` (V4.1 Flash, V4 Pro); la API directa usaría `reasoning_effort` (sin probar). El backend rechaza (400) un nivel que el modelo no admite; el navegador recuerda el nivel elegido para cada modelo.
- Frontend del chat: `useChatLibre` (estado y envío) + componentes en `components/chat/`; estilos en `app/chat/chat.css`. Revisado con capturas de Edge sin ventana (escritorio y 390 px, claro y oscuro).

## 7d. Reportes ciudadanos ambientales (Bogotá) — el foco del curso

**Base de conocimiento**: `knowledge/reportes_ciudadanos_bogota.yaml` (consultada el 2026-11-10, cada dato con fuente y `verificado`):
7 tipos (`residuos`, `arbolado`, `quema`, `ruido`, `aire`, `agua`, `otro`) con palabras clave, entidad, canales y datos a pedir;
9 canales oficiales (123, SDA y sus áreas de ruido/flora/residuos/fauna con teléfono, Línea 110 de aseo, 195 opción 8, Bogotá Te Escucha),
con versión corta para leer en voz alta; normas: **Res. 627/2006** (horario diurno/nocturno y Tabla 1 por sector, transcritas del gestor
normativo: `verificado: true`), **Ley 1801/2016** arts. 33, 100 y 111 y **Decreto 1076/2015** (quemas) como **resúmenes** de fuentes
secundarias (`verificado: false`: confirmar contra el texto oficial), ruta del ruido y permisos de tala (bogota.gov.co); las 20 localidades;
y la **escala de prioridad, que es criterio del proyecto** (`verificado: false`). Se indexa en pgvector junto con la norma del aire (68 fragmentos).

**Clasificación y prioridad por reglas** (`reportes-ciudadanos/services/clasificacion.service.ts`, funciones puras): texto normalizado
(sin tildes), palabras completas; el tipo con más pistas (frase = 2 puntos); si las reglas tienen ≥ 2 puntos mandan ellas, si no, se acepta
la propuesta del modelo. Prioridad = base del tipo + peligro (+3 y **emergencia → "llama ya al 123"**) + en curso (+1) + lugar sensible
(hospital, colegio, jardín, humedal: +1) + recurrente (+1) + ruido nocturno (+1); alta ≥ 4, media ≥ 2. Lo negado ("no hay llamas") no cuenta.
Se guarda lo que propuso el modelo y lo que dieron las reglas (`tipoModelo`, `tipoReglas`) para evaluarlos.

**Datos (PostgreSQL)**: `ReporteCiudadano` (radicado `RA-AAAA-NNNNN` consecutivo en transacción, tipo, descripción, dirección, localidad,
barrio, lat/lon opcionales, cuándo, en curso, prioridad, puntaje, motivos, emergencia, entidad, canales, estado, canal texto/voz/formulario,
contacto opcional —puede ser anónimo— y **`embedding vector(768)`** de la descripción con índice HNSW); `ReporteCiudadanoEvento` (historial de
estados con autor y nota); `ReporteEvidencia` (une el reporte con `ChatAdjunto`: la foto o el audio quedan en bytea con su descripción o
transcripción indexada). Migración `ReportesCiudadanos`. Estados: recibido → en_revision → remitido → cerrado.
**Duplicados (búsqueda híbrida SQL + vector)**: mismo tipo, misma localidad, últimos 30 días y coseno ≥ 0,72. Medido: el mismo hecho contado
distinto dio 0,73–0,89 y hechos distintos del mismo tipo llegaron a 0,73; por eso el vector solo no basta.
**El radicado es del prototipo, no oficial**: el agente siempre lo dice y da los canales oficiales para radicar de verdad.

**Agente** (8 herramientas): nuevas `registrar_reporte_ciudadano` y `consultar_reporte_ciudadano`. Flujo: si falta el lugar, la herramienta
devuelve error y el modelo pregunta; con datos completos el sistema analiza y **una persona confirma** (diálogo que también se lee en voz alta)
antes de guardar; la respuesta la escribe el código (emergencia primero, radicado, prioridad, entidad, canales cortos, posibles duplicados,
aviso de que no es oficial). Guardas nuevas: radicado que ninguna herramienta devolvió → rechazo; "quedó registrado" sin registrar → rechazo;
**dirección que el ciudadano no dijo → no se registra** (`direccionDicha`: ≥ 50 % de sus palabras significativas en los mensajes del usuario).
Si el usuario solo pregunta dónde reportar, debe usar `consultar_norma`, no registrar.
Fallos reales que motivaron esas guardas (2026-11-10): ante "¿Dónde denuncio que están talando un árbol?" registró un reporte con una dirección
**inventada** ("Calle 100 # 10 - 20"); y escribió la llamada a `consultar_norma` como texto (`consultar_norma {"pregunta": …}` sin "name"),
que el analizador ahora reconoce. Las evidencias del mensaje llegan al agente como texto: transcripción del audio o descripción de la foto
(`qwen2.5vl`, hasta 90 s), así puede clasificar por la foto.

**Voz en el agente** (`/asistente`): 🎤 dicta (Whisper; el audio queda como evidencia y el reporte con canal `voz`), 📎 adjunta fotos/audios,
🔊 lee cada respuesta y "Responder por voz" lo hace solo (Kokoro, `POST /api/voz/hablar`, MP3). `paraVoz()` limpia el texto: sin Markdown,
citas ni enlaces; µg/m³ y dB(A) en palabras; teléfonos dígito a dígito. Prueba de ida y vuelta TTS → STT: Kokoro `ef_dora` y `em_alex` se
entendieron palabra por palabra; Piper `es_MX-claude-high` cortó la frase y `es_MX-ald` falló (descartados).

**Tablero** (`/reportes-ciudadanos`): totales, abiertos, emergencias, alta prioridad, filtros (tipo, prioridad, estado, localidad), tabla y
detalle con motivos de la prioridad, modelo vs. reglas, canales, evidencias (foto, audio, descripción), historial y cambio de estado.
API: `GET /reportes-ciudadanos` · `/estadisticas` · `/catalogo` · `/:radicado` · `POST /reportes-ciudadanos` (formulario) · `/analizar` (sin guardar)
· `/:radicado/estado`; `GET /voz` · `POST /voz/hablar`.

**EmbeddingGemma** (`OLLAMA_EMBEDDING_MODEL=embeddinggemma`): prefijos `title: none | text: ` (documentos) y `task: search result | query: `
(consultas) en `prefijoEmbedding()`. Escala distinta a nomic: 12 preguntas pertinentes 0,46–0,75 (la correcta siempre en el top 5, 8/12 en
el primer lugar) y 6 ajenas 0,06–0,15 → **`SIMILARITY_MIN` = 0,30** (con nomic era 0,65; con ese umbral EmbeddingGemma habría descartado casi
todo). Al arrancar, `NormaService.motivoParaReindexar()` reindexa si cambió el número de fragmentos o el modelo (re-embebe un fragmento
conocido y compara: con el mismo modelo da ~1); si cambió el modelo, recalcula también la memoria del chat y los vectores de los reportes.

**Evaluación** (`npm run evaluar`, `evaluacion/casos.yaml` + `evaluar.mjs`, contra la API en marcha): 30 casos (22 reportes de todos los tipos,
4 preguntas que no deben registrar, 4 sin lugar que deben preguntarlo), 6 de ellos por voz (Kokoro → Whisper → agente, con WER). Mide
registro, tipo final/del modelo/de las reglas, prioridad, emergencia, uso de `consultar_norma`, si pregunta el lugar y latencia. Informe en
`evaluacion/resultados/<fecha>.md`; `--limpiar` borra los reportes que creó. **Resultados** (`evaluacion/RESULTADOS.md`, 3 corridas): en la 3.ª, con 38 casos,
tipo final 27/27, prioridad 26/27, emergencias 27/27, preguntas sin registrar 5/5, WER de la voz 4,3 %, latencia p50 4,5 s; los 8 casos de
generalización (escritos sin usarlos para ajustar) dieron 7/8. Limitaciones que quedan: Q3 (pregunta en vez de registrar tras el 123) y G7 (un
lugar dicho pero no ubicable en Bogotá se acepta).

## 7c. Voz, archivos y memoria vectorial del chat

**Voz (🎤)**: el navegador graba (MediaRecorder, Opus/WebM; solo funciona en `localhost`/`127.0.0.1` o https) → `POST /chat/voz/transcribir` →
Whisper `large-v3-turbo` en la GPU (contenedor `stt`, `int8_float16`, se descarga de la GPU tras 10 min sin uso) → el texto vuelve a la caja para
revisarlo antes de enviar. **El audio no sale del PC.** La nota de voz queda guardada (bytes + transcripción indexada) y unida al mensaje
(`dictado: true`: su texto no se le repite al modelo). Medido: 9 s de audio en español transcritos palabra por palabra (incluidos "PM2.5" y "37") en ~5 s.
El modelo de Whisper se descarga la primera vez que el backend lo pide (`POST /v1/models/{id}`) y queda en el volumen `agente_ambiental_stt_modelos`.

**Archivos (📎, arrastrar o pegar)**: se suben en cuanto se eligen (`POST /chat/adjuntos`, máx. `CHAT_ADJUNTO_MAX_MB` = 20) y se guardan en PostgreSQL.
- Documentos → texto extraído en el backend: PDF (`unpdf`, por páginas), Word (`mammoth`), Excel (`exceljs`, hoja por hoja), CSV/TXT/MD/JSON/código. Así sirven **para los 3 proveedores**.
- Imágenes (PNG/JPG/GIF/WebP) → nativas: Claude (todos), DeepSeek V4.1 Flash, Ollama `qwen2.5vl:7b` (detectado por `capabilities: vision` de `/api/show`). Además, `qwen2.5vl` las **describe en segundo plano** y la descripción se indexa (se pueden buscar por texto).
- PDF sin texto (escaneado) → solo Claude (bloque `document` nativo); en los demás, error claro. Un audio subido con 📎 se transcribe con Whisper.
- El backend rechaza (400) lo que el modelo elegido no puede ver; la pantalla lo avisa antes de enviar.
- Claude recibe imágenes y PDF por `claude -p --input-format stream-json` (bloques `image`/`document` de la API de Anthropic); DeepSeek por `image_url` (data URI); Ollama por `images`.

**Memoria vectorial**: todo texto (documento, transcripción, descripción de imagen) se parte en fragmentos de ~1000 caracteres con 150 de solape
(`fragmentar`, corta en párrafos/frases), se embebe con `nomic-embed-text` y se guarda en `ChatFragmento` (pgvector, HNSW coseno).
Al enviar (`ContextoService`): si los documentos de la conversación caben en el modelo (`maxCaracteresDocumentos`: Ollama 12k por su `num_ctx` de 8192,
Claude 300k, DeepSeek según su contexto) van **completos**; si no, **RAG**: van los k fragmentos más parecidos a la pregunta (k ≈ presupuesto/1100, máx. 40).
Sin Ollama (no hay embeddings) se recortan en proporción. La respuesta muestra cómo entraron ("Leyó 3 archivos completos" / "recibió los 10 fragmentos más relevantes").
Probado de verdad: `qwen2.5:14b` (8k de contexto) respondió bien sobre un dato de la página 9 de un PDF de 12 páginas (48 000 caracteres) con 10 fragmentos.
`GET /chat/memoria/buscar?q=` busca por significado en todo (o en una conversación).

**VRAM (RTX 3060, 12 GB)**: `qwen2.5:14b` ~9 GB, Whisper turbo ~1,6 GB, `qwen2.5vl:7b` ~6 GB: no caben todos a la vez; Ollama carga y descarga solo (unos segundos al cambiar).
**Privacidad**: lo que se adjunta a Claude o a DeepSeek sale del PC; con Ollama y la voz, no.
- El backend solo acepta modelos que estén en la lista del proveedor (nada arbitrario llega a la línea de comandos de Claude).
- Secretos: `.env` de la raíz (lo lee Docker Compose) y `backend-agente/.env` (desarrollo). Ninguno se imprime ni se sube.
- El streaming es NDJSON (`inicio`, `texto`/`razonamiento`…, `error`?, `fin`) con `Cache-Control: no-transform` para que el proxy de Next.js no lo acumule.

## 8. Cómo se evita que el modelo se equivoque (y qué NO se evita)

Verificaciones en código (`verificacion/`, `redaccion/`, `asistente/`, `norma/`): cifras ⊆ datos que se le dieron · comparaciones entre estaciones contra
rankings calculados por código · palabras normativas prohibidas en texto del modelo · citas a fragmentos recuperados · nombres de archivo que
no existen · el modelo **no puede afirmar que generó un reporte sin llamar a la herramienta** · tras `generar_reporte` la respuesta la escribe
**siempre el código** · sobrescribir un reporte exige **confirmación humana** (sin respuesta en 5 min = no).

**Fallos reales que tuvo `qwen2.5:14b`** (útiles para el informe del curso; cada uno tiene una prueba de regresión):
Guaymaral "con el NO₂ más alto" (era Puente Aranda) con cifras correctas · "ha sido generado" sin llamar a la herramienta ·
"no se reportan excedencias" cuando Kennedy excedió · inventó el nombre de un archivo (`rmcab_10_largo.csv`) · en el RAG, una
respuesta correcta pero **incompleta** (omitió el límite anterior de 100 µg/m³) · en el verificador mismo, un aviso de rechazo que citaba la cifra
rechazada la volvía "fuente válida".

**Límites conocidos**: no detecta números escritos con letras, causas o efectos inventados, ni respuestas incompletas o mal interpretadas;
solo comprueba cifras, citas, nombres de archivo y afirmaciones de generación.

## 9. Pruebas

```powershell
cd backend-agente ; npm test                 # 313 unitarias (23 suites), sin red ni base de datos (Jest corre con --experimental-vm-modules: unpdf es solo ESM)
cd backend-agente ; npm run evaluar          # evaluación del agente con 30 casos reales contra la API en marcha (usa Ollama, Whisper y Kokoro de verdad; ver §7d)
cd backend-agente ; npm run test:db          # 25 de extremo a extremo contra PostgreSQL + pgvector REALES (requiere `docker compose up -d db`)
cd frontend-agente ; npx tsc --noEmit ; npm run build
```

- Las unitarias portan los casos de la versión anterior en Python (motor de reglas, unidades, QA/QC, estadística, verificadores, redacción, agente), incluidas las regresiones de los fallos del modelo.
- **Paridad con el motor Python**: `analisis/services/hechos.service.spec.ts` compara el análisis de octubre de 2026 con `test/fixtures/golden-hechos-2026-10.json`
  (el `hechos.json` que generó el motor Python) cifra por cifra, con tolerancia de redondeo 0,0101. Pasa: mismas excedencias, mismas series no evaluables, mismas medias y máximos.
  Esa prueba es lo que permitió borrar el motor Python.
- El Excel crudo de la RMCAB se lee y da exactamente las mismas mediciones que el CSV (`datos.service.spec.ts`).
- El extremo a extremo (`test/app.db-spec.ts`) arranca la aplicación completa en la base `agente_test` (se recrea en cada corrida), con migraciones, y recorre la API por HTTP;
  solo Ollama y la carpeta de salida son falsos.
- No hay pruebas automáticas del frontend: se verificó a mano en el navegador. Las pruebas no llaman al modelo real: la calidad de sus respuestas se comprobó a mano.

## 10. Datos y norma

- Datos de ejemplo: `backend-agente/data/rmcab_2026-10_largo.csv` (octubre 2026; Guaymaral, Kennedy, Puente Aranda; **datos preliminares** de la RMCAB, descargados 2026-11-03). Formato largo `estacion, fecha_hora, variable, valor, unidad`;
  `fecha_hora` es el **fin** del periodo horario (744 horas en octubre). Procedencia en `backend-agente/data/README.md`.
- Base de conocimiento: `backend-agente/knowledge/aire_res2254_2017.yaml` (única fuente de verdad de la norma; cada regla lleva su fuente), `estaciones_rmcab.yaml` (tabla de 2021, por reconfirmar) y `esquema_reporte_aire_mensual.yaml`.
- **Resultado de octubre 2026** (preliminar): Kennedy excede el 28-oct PM10 (80,24 > 75 µg/m³) y PM2.5 (41,29 > 37, nivel de prevención de la Tabla 4). **No evaluables** (< 75 % de datos válidos): O₃ de Kennedy (56 %) y SO₂ de Puente Aranda (0 %).

## 11. Decisiones y reglas de trabajo

- **Nada se inventa**: si falta un dato normativo se declara en el YAML (`pendientes`) y en el reporte (Limitaciones), no se rellena.
- Lo provisional está marcado (`verificado: false`): validez de promedios (18/24 h, 6/8 h), día calendario para 24 h, media móvil retrospectiva de 8 h.
- Evaluación **por punto de monitoreo** (Res. 2254, Art. 2 par. 2); un informe mensual solo evalúa 24 h, 8 h y 1 h (el anual no se puede evaluar con un mes).
- Hora: el dato `01:00` es el promedio de 00:01 a 01:00; todo se maneja como milisegundos UTC "ingenuos" para que ningún cambio de hora local lo altere.
- El backend solo escucha en `127.0.0.1` (en Docker, dentro del contenedor en `0.0.0.0` pero publicado solo a `127.0.0.1`); las descargas son una lista cerrada; los archivos de datos solo se leen de `backend-agente/data/`; los DTO rechazan campos desconocidos.
- No abrir ni imprimir `telegram-bot/.env` (token). No exponer el puerto de Ollama a Internet.
- Cambios de esquema: **siempre con migración** (`migration:generate`), nunca `synchronize`. Cambios de la norma: en el YAML (+ prueba), no en el código.
- Para ver el patrón de módulos, mirar `C:\Trabajo\hoteles-putumayo\backend-hotel` (solo lectura: no se modifica).

## 12. Historia (resumen de cómo se llegó aquí)

1. **Fases 0–2** (2026-11-03/04): Ollama + `qwen2.5:14b`; datos reales de la RMCAB de octubre 2026 (3 estaciones) y su adaptador al formato estándar; la Res. 2254/2017 transcrita a YAML (Tablas 1–5, condiciones de referencia, factores ppb/ppm→µg/m³) con cada regla y su fuente; motor de reglas generado desde las tablas.
   Hallazgos: el nivel de prevención de NO₂ (190) empieza por debajo de su límite horario (200) en el texto de la norma; un informe mensual no puede evaluar límites anuales; el ozono de Kennedy tiene 56 % de datos.
2. **Fases 3–4**: QA/QC sin descartes silenciosos, hechos reproducibles, reporte Word de 12 secciones con trazabilidad y un verificador de cifras para el modelo. Las corridas reales mostraron que verificar cifras no basta (ver §8): de ahí los rankings por código, la verificación por cláusula y sacar del modelo todo lo normativo.
3. **Fases 5–6**: agente con herramientas fijas y guardas; interfaces CLI, bot de Telegram (probado solo con una API simulada) y una página HTML local.
4. **2026-11-09, re-arquitectura** (a petición de Jhon, para la presentación): backend NestJS, frontend Next.js, PostgreSQL y búsqueda vectorial (la Fase 7 "RAG de normas", que era opcional y no existía); la base de datos tampoco existía antes (todo vivía en archivos).
5. **2026-11-09, todo a TypeScript**: el motor Python se portó al backend NestJS (con TypeORM, módulos al estilo hoteles-putumayo, migraciones, Docker Compose para db + backend + frontend), se comprobó la paridad contra su salida real y se **borró `motor/`**.
   Con él se fueron la CLI, el bot de Telegram, `web.py` y sus 236 pruebas de Python (los casos se portaron a Jest). El bot de Telegram podría volver como un módulo más de NestJS.
6. **2026-11-10, chat libre y renombrado**: carpetas `backend/` → `backend-agente/` y `frontend/` → `frontend-agente/` (también los servicios y contenedores de Compose).
   Pantalla `/chat` para conversar con Ollama, DeepSeek (API) o Claude (suscripción, vía Claude Code). Probado de verdad: streaming por el proxy, contexto compartido entre proveedores, Detener, rechazo de DeepSeek sin saldo.
   Luego: DeepSeek pasó a OpenRouter; token de Claude para Docker; catálogo completo de modelos de Claude con niveles de capacidad; rediseño del chat en componentes;
   voz (Whisper local en GPU, contenedor `stt`), archivos para los 3 proveedores (texto extraído + imágenes nativas + `qwen2.5vl:7b`) y memoria vectorial en pgvector con RAG (§7c).
7. **2026-11-10, el agente del curso**: el enunciado (agente n.° 5, *reportes ciudadanos*) no se cumplía (el proyecto solo hacía el reporte
   mensual del aire, sin TTS ni EmbeddingGemma). Se agregó: base de conocimiento de reportes de Bogotá (normas y canales con fuente), clasificación y
   prioridad por reglas, tablas `ReporteCiudadano`/`ReporteCiudadanoEvento`/`ReporteEvidencia` con vector y duplicados híbridos, dos herramientas con
   confirmación humana y guardas nuevas, TTS Kokoro, voz y evidencias en `/asistente`, tablero `/reportes-ciudadanos`, EmbeddingGemma recalibrado
   (umbral 0,30) y una evaluación de 38 casos con voz (§7d). Territorio: Bogotá.

## 13. Pendiente / ideas (por prioridad sugerida)

1. **Tabla 6 del ICA** (puntos de corte; es imagen en la fuente): sin ella el reporte no calcula el índice y la sección *Impacto en la salud* solo transcribe la Tabla 5.
2. Leer el texto primario del **Protocolo (Res. 650/2010)** para confirmar condiciones de referencia y validez de promedios.
3. **Ruido como medición** (RMRAB): los reportes ciudadanos de ruido y la Res. 627/2006 ya están (§7d); falta la fuente de datos de la red de ruido para evaluar mediciones.
3b. **Reportes ciudadanos**: confirmar contra el texto oficial los resúmenes marcados `verificado: false` (Ley 1801 arts. 33, 100, 111; Decreto 1076 quemas); validar la escala de prioridad con alguien de la SDA; georreferenciar (lat/lon y mapa); notificar al ciudadano los cambios de estado; que "en curso" no dependa solo del modelo (falló en R1 y N2 de la evaluación).
4. Comparar el reporte con el **informe oficial de la SDA** de octubre cuando se publique; revisar el tono de los textos.
5. Subir datos desde la interfaz (hoy los archivos se copian a `backend-agente/data/`); exportar PDF; IBOCA; comparación con el mes anterior; autenticación si alguna vez se expone fuera del PC.
6. RAG: búsqueda híbrida (palabras clave + vector) y responder primero los hechos completos (el modelo a veces omite parte del fragmento).
7. Pruebas automáticas del frontend; probar la interfaz en celular y en otros navegadores.
8. Reponer el bot de Telegram como módulo de NestJS (reutilizando `AgenteService`).
9. Chat libre: OCR para PDF escaneados fuera de Claude; renderizar fórmulas (KaTeX) y resaltar código; renombrar conversaciones; una pantalla para buscar en la memoria (hoy solo `GET /chat/memoria/buscar`); borrar adjuntos sueltos viejos (subidos y nunca enviados).

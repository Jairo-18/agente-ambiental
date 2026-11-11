# Evaluación del agente de reportes ciudadanos (Bogotá) — 2026-11-10

Agente: `qwen2.5:14b` (Ollama, local) con 8 herramientas fijas y guardas en código. Voz: Kokoro (TTS) → Whisper
large-v3-turbo (STT), ambos locales. Embeddings: EmbeddingGemma. Casos: `casos.yaml`; script: `evaluar.mjs`
(`npm run evaluar`). Cada caso corre en una conversación nueva; la confirmación humana la da el script.
Los informes completos de cada corrida están en `resultados/`.

## Las tres corridas

| Métrica | 1.ª (21:36) | 2.ª (21:42) | 3.ª (21:48) |
|---|---|---|---|
| Casos | 30 | 30 | **38** (30 + 8 de generalización) |
| Registró los reportes que debía | 20/22 (91 %) | 21/22 (95 %) | 27/28 (96 %) |
| Tipo final correcto | 18/20 (90 %) | 21/21 (100 %) | 27/27 (100 %) |
| — propuesta del modelo | 19/20 (95 %) | 20/21 (95 %) | 25/27 (93 %) |
| — reglas del código | 18/20 (90 %) | 21/21 (100 %) | 27/27 (100 %) |
| Prioridad correcta | 17/20 (85 %) | 17/21 (81 %) | 26/27 (96 %) |
| Emergencia (decir "llama al 123") | 20/20 | 21/21 | 27/27 (100 %) |
| Preguntas: no registra y usa la norma | 4/4 | 4/4 | 5/5 |
| Falta el lugar: no registra y lo pregunta | 4/4 | 3/4 | 4/5 |
| Latencia p50 / p95 | 4,5 / 8,3 s | 4,5 / 9,6 s | 4,5 / 12,1 s |
| WER de la voz (Kokoro → Whisper) | 4,2 % (6) | 4,2 % (6) | 4,3 % (7) |

**Casos de generalización (G1–G8)**: se escribieron después de la 2.ª corrida y **no se usaron para ajustar** reglas ni
prompts: 7 de 8 correctos (falló G7, ver abajo). Los 30 primeros sí se usaron para corregir, así que sus cifras de las
corridas 2 y 3 son optimistas; las de G1–G8 son la mejor estimación de cómo generaliza.

## Qué se corrigió entre corridas (y por qué)

1. → 2.: `en_curso` dejó de ser obligatorio (el modelo preguntaba "¿está pasando ahora?" por un botadero); ante una
   emergencia con lugar conocido, registrar en el mismo turno; frases "quemar/queman basura" (valen 2); un cuerpo de agua
   (río, quebrada, humedal, canal) decide el tipo `agua` aunque haya basura dentro (`palabras_fuertes`, valen 3).
2. → 3.: el analizador acepta más formas de llamada escrita como texto (`consultar_norma({…})`, nombre separado del JSON
   por basura); la prioridad lee también la dirección (el modelo ponía ahí "frente al colegio"); "en curso" solo cuenta si
   el texto lo dice ("ahora", "están quemando…") y no por lo que suponga el modelo.
3. Después de la 3.ª: las reglas leen además **las palabras del propio ciudadano** (desde el último registro), no solo el
   resumen del modelo (R4 volvió a fallar porque el resumen omitió "colegio"). Comprobado en vivo con R4, N4 y W1.

## Fallos que quedan (limitaciones honestas)

- **Q3** (incendio en los cerros): dijo que llamara al 123 pero en vez de registrar preguntó "¿estás listo para proceder?".
  Conservador, no peligroso.
- **G7** ("están quemando pasto en el potrero de la vereda, al lado de una casa"): registró. La guarda comprueba que el
  lugar lo dijo el ciudadano, **no que sea un lugar ubicable en Bogotá**: falta geocodificar o pedir una referencia urbana.
- La prioridad depende de que el texto traiga las pistas (palabras del YAML): un reporte grave contado sin ellas queda bajo.
  La escala de prioridad es **criterio del proyecto**, no un protocolo oficial de la SDA.
- Las latencias son de una RTX 3060 con el modelo ya cargado; la primera petición tras cambiar de modelo tarda más.

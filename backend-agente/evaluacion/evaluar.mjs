// Evaluación del agente de reportes ciudadanos con casos concretos (evaluacion/casos.yaml) contra la API en marcha.
//
//   cd backend-agente ; npm run evaluar                 (API en http://127.0.0.1:4000)
//   npm run evaluar -- --solo Q1,N3      --sin-voz      --limpiar
//
// Mide, por caso: si registró (o no) cuando debía, tipo final / del modelo / de las reglas, prioridad, emergencia, si
// preguntó el lugar cuando faltaba y la latencia. Los casos `voz: true` pasan por la cadena completa: el texto se
// sintetiza con Kokoro (TTS), se transcribe con Whisper (STT) y lo transcrito es lo que recibe el agente (se mide el WER).
// Escribe evaluacion/resultados/<fecha>.md y .json. --limpiar borra al final los reportes que creó la evaluación.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const { parse } = createRequire(import.meta.url)('yaml');
const API = process.env.API ?? 'http://127.0.0.1:4000/api';
const args = process.argv.slice(2);
const solo = args.includes('--solo') ? args[args.indexOf('--solo') + 1].split(',') : null;
const sinVoz = args.includes('--sin-voz');
const limpiar = args.includes('--limpiar');

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (r, c) => { const x = await fetch(API + r, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }); return x.json(); };
const get = async (r) => (await fetch(API + r)).json();
const normalizar = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim();

/** Word error rate (distancia de edición entre palabras / palabras de la referencia). */
function wer(referencia, hipotesis) {
  const r = normalizar(referencia).split(' '), h = normalizar(hipotesis).split(' ');
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return d[r.length][h.length] / r.length;
}

/** TTS (Kokoro) → STT (Whisper): lo que el agente "oye" si el ciudadano dice el mensaje. */
async function porVoz(texto) {
  const t0 = Date.now();
  const audio = await fetch(`${API}/voz/hablar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }) });
  if (!audio.ok) throw new Error(`TTS ${audio.status}`);
  const tts = Date.now() - t0;
  const form = new FormData();
  form.append('audio', new Blob([await audio.arrayBuffer()], { type: 'audio/mpeg' }), 'caso.mp3');
  const t1 = Date.now();
  const r = await (await fetch(`${API}/chat/voz/transcribir`, { method: 'POST', body: form })).json();
  if (!r.adjunto) throw new Error(`STT: ${r.message}`);
  return { texto: r.texto, adjuntoId: r.adjunto.id, msTts: tts, msStt: Date.now() - t1 };
}

/** Un turno del agente: espera el trabajo y confirma lo que pida (como lo haría el ciudadano). */
async function turno(mensaje, extra = {}) {
  const t0 = Date.now();
  const { trabajoId, message } = await post('/asistente/mensajes', { mensaje, ...extra });
  if (!trabajoId) throw new Error(message);
  let pregunta = null;
  for (;;) {
    const t = await get(`/trabajos/${trabajoId}`);
    if (t.estado !== 'en_curso') return { ...(t.resultado ?? { respuesta: `ERROR: ${t.error?.mensaje}`, llamadas: [] }), pregunta, ms: Date.now() - t0 };
    const { pendiente } = await get('/asistente/pendiente');
    if (pendiente) { pregunta = pendiente.pregunta; await post('/asistente/confirmar', { id: pendiente.id, ok: true }); }
    await espera(600);
  }
}

const PREGUNTA_LUGAR = /\b(donde|direccion|ubicacion|lugar|referencia|en que (barrio|localidad|calle|sitio))\b/;

const { casos } = parse(readFileSync(join(aqui, 'casos.yaml'), 'utf8'));
const elegidos = casos.filter((c) => !solo || solo.includes(c.id));
const resultados = [];
console.log(`Evaluando ${elegidos.length} casos contra ${API}…`);
for (const c of elegidos) {
  await post('/asistente/nueva', {});
  const r = { id: c.id, mensaje: c.mensaje, esperado: c.esperado, voz: !!c.voz && !sinVoz };
  try {
    let mensaje = c.mensaje;
    const extra = {};
    if (r.voz) {
      const v = await porVoz(c.mensaje);
      Object.assign(r, { transcripcion: v.texto, wer: wer(c.mensaje, v.texto), msTts: v.msTts, msStt: v.msStt });
      mensaje = v.texto;
      Object.assign(extra, { adjuntoIds: [v.adjuntoId], canal: 'voz' });
    }
    const t = await turno(mensaje, extra);
    const reg = [...(t.llamadas ?? [])].reverse().find((l) => l.herramienta === 'registrar_reporte_ciudadano' && !l.error);
    const radicado = /RA-\d{4}-\d{5}/.exec(t.respuesta ?? '')?.[0] ?? null;
    const reporte = radicado ? await get(`/reportes-ciudadanos/${radicado}`) : null;
    Object.assign(r, {
      ms: t.ms, origen: t.origen, herramientas: (t.llamadas ?? []).map((l) => l.herramienta + (l.error ? '(error)' : '')), respuesta: t.respuesta,
      registro: !!reporte?.radicado, radicado: reporte?.radicado ?? null, tipo: reporte?.tipo ?? null, tipoModelo: reporte?.clasificacion?.tipo_modelo ?? null,
      tipoReglas: reporte?.clasificacion?.tipo_reglas ?? null, prioridad: reporte?.prioridad ?? null, emergencia: reporte?.emergencia ?? null,
      canal: reporte?.canal ?? null, preguntaLugar: !reporte && PREGUNTA_LUGAR.test(normalizar(t.respuesta ?? '')), usoNorma: (t.llamadas ?? []).some((l) => l.herramienta === 'consultar_norma'),
      pidioConfirmacion: !!t.pregunta, problemas: t.problemas ?? [],
    });
    const e = c.esperado;
    if (e.registra === true) {
      Object.assign(r, { okRegistro: r.registro, okTipo: r.tipo === e.tipo, okPrioridad: r.prioridad === e.prioridad, okEmergencia: r.emergencia === e.emergencia });
    } else if (e.registra === false) {
      Object.assign(r, { okRegistro: !r.registro, okNorma: r.usoNorma });
    } else {
      Object.assign(r, { okRegistro: !r.registro, okPreguntaLugar: r.preguntaLugar });
    }
    void reg;
  } catch (err) {
    r.error = err.message;
  }
  resultados.push(r);
  const marca = (v) => (v === undefined ? '' : v ? '✓' : '✗');
  console.log(`${c.id.padEnd(3)} ${String(((r.ms ?? 0) / 1000).toFixed(1)).padStart(5)} s  registro ${marca(r.okRegistro)} tipo ${marca(r.okTipo)} prio ${marca(r.okPrioridad)} emerg ${marca(r.okEmergencia)} ${r.okNorma !== undefined ? `norma ${marca(r.okNorma)}` : ''}${r.okPreguntaLugar !== undefined ? `pregunta lugar ${marca(r.okPreguntaLugar)}` : ''}${r.voz ? `  WER ${(r.wer * 100).toFixed(0)} %` : ''}${r.error ? `  ERROR ${r.error}` : ''}`);
}

// --- resumen ---
const de = (f) => resultados.filter(f);
const tasa = (lista, campo) => { const l = lista.filter((r) => r[campo] !== undefined); return { ok: l.filter((r) => r[campo]).length, n: l.length }; };
const pct = ({ ok, n }) => (n ? `${ok}/${n} (${Math.round((ok / n) * 100)} %)` : '—');
const reportes = de((r) => r.esperado.registra === true);
const registrados = reportes.filter((r) => r.registro);
const lat = resultados.map((r) => r.ms).filter(Boolean).sort((a, b) => a - b);
const p = (q) => (lat.length ? (lat[Math.min(lat.length - 1, Math.floor(q * lat.length))] / 1000).toFixed(1) : '—');
const voz = de((r) => r.voz && r.wer !== undefined);
const resumen = {
  registro_correcto_en_reportes: pct(tasa(reportes, 'okRegistro')),
  tipo_final_correcto: pct(tasa(registrados, 'okTipo')),
  tipo_del_modelo_correcto: pct({ ok: registrados.filter((r) => r.tipoModelo === r.esperado.tipo).length, n: registrados.length }),
  tipo_de_las_reglas_correcto: pct({ ok: registrados.filter((r) => r.tipoReglas === r.esperado.tipo).length, n: registrados.length }),
  prioridad_correcta: pct(tasa(registrados, 'okPrioridad')),
  emergencia_correcta: pct(tasa(registrados, 'okEmergencia')),
  preguntas_sin_registrar: pct(tasa(de((r) => r.esperado.registra === false), 'okRegistro')),
  preguntas_con_consultar_norma: pct(tasa(de((r) => r.esperado.registra === false), 'okNorma')),
  incompletos_sin_registrar: pct(tasa(de((r) => r.esperado.registra === 'pregunta_direccion'), 'okRegistro')),
  incompletos_pregunta_el_lugar: pct(tasa(de((r) => r.esperado.registra === 'pregunta_direccion'), 'okPreguntaLugar')),
  latencia_p50_s: p(0.5), latencia_p95_s: p(0.95),
  wer_medio_voz: voz.length ? `${((voz.reduce((s, r) => s + r.wer, 0) / voz.length) * 100).toFixed(1)} % en ${voz.length} casos` : '—',
  errores: de((r) => r.error).length,
};
console.log('\nResumen:', resumen);

const fecha = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
mkdirSync(join(aqui, 'resultados'), { recursive: true });
writeFileSync(join(aqui, 'resultados', `${fecha}.json`), JSON.stringify({ fecha, api: API, resumen, resultados }, null, 2));
const fila = (r) => `| ${r.id} | ${r.voz ? '🎤' : ''} | ${r.esperado.registra === true ? `${r.esperado.tipo} / ${r.esperado.prioridad}${r.esperado.emergencia ? ' / 123' : ''}` : r.esperado.registra === false ? 'pregunta' : 'falta lugar'} | ${r.registro ? `${r.radicado} ${r.tipo} / ${r.prioridad}${r.emergencia ? ' / 123' : ''} (modelo: ${r.tipoModelo ?? '—'}, reglas: ${r.tipoReglas ?? '—'})` : r.usoNorma ? 'respondió con la norma' : r.preguntaLugar ? 'preguntó el lugar' : 'no registró'} | ${['okRegistro', 'okTipo', 'okPrioridad', 'okEmergencia', 'okNorma', 'okPreguntaLugar'].filter((k) => r[k] !== undefined).every((k) => r[k]) ? '✓' : '✗'} | ${((r.ms ?? 0) / 1000).toFixed(1)} s | ${r.voz ? `${(r.wer * 100).toFixed(0)} %` : ''} |`;
const md = [
  `# Evaluación del agente de reportes ciudadanos — ${fecha}`, '',
  `API: ${API}. Modelo del agente: qwen2.5:14b (Ollama). Voz: Kokoro (TTS) → Whisper large-v3-turbo (STT). Embeddings: EmbeddingGemma.`, '',
  '## Resumen', '', '| Métrica | Resultado |', '|---|---|', ...Object.entries(resumen).map(([k, v]) => `| ${k.replace(/_/g, ' ')} | ${v} |`), '',
  '## Casos', '', '| Caso | Voz | Esperado | Obtenido | OK | Tiempo | WER |', '|---|---|---|---|---|---|---|', ...resultados.map(fila), '',
  '## Transcripciones (casos por voz)', '', ...voz.map((r) => `- **${r.id}** (WER ${(r.wer * 100).toFixed(0)} %)\n  - dicho: ${r.mensaje}\n  - oído: ${r.transcripcion}`), '',
  '## Fallos', '', ...resultados.filter((r) => r.error || ['okRegistro', 'okTipo', 'okPrioridad', 'okEmergencia', 'okNorma', 'okPreguntaLugar'].some((k) => r[k] === false))
    .map((r) => `- **${r.id}**: ${r.error ?? ''} esperado ${JSON.stringify(r.esperado)}; obtenido tipo=${r.tipo} prioridad=${r.prioridad} emergencia=${r.emergencia} herramientas=${(r.herramientas ?? []).join(', ')}\n  - respuesta: ${(r.respuesta ?? '').replace(/\n+/g, ' ').slice(0, 300)}`),
].join('\n');
writeFileSync(join(aqui, 'resultados', `${fecha}.md`), md);
console.log(`\nInforme: evaluacion/resultados/${fecha}.md`);

if (limpiar) {
  const radicados = resultados.map((r) => r.radicado).filter(Boolean);
  if (radicados.length) {
    execFileSync('docker', ['exec', 'agente-ambiental-db', 'psql', '-U', 'agente', '-d', 'agente_ambiental', '-c',
      `DELETE FROM "ReporteCiudadano" WHERE "radicado" IN (${radicados.map((x) => `'${x}'`).join(',')})`], { stdio: 'inherit' });
  }
}

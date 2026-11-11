'use client';

import Link from 'next/link';
import { KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AdjuntoEnviado, ChipPendiente } from '@/components/chat/Adjunto';
import BotonVoz from '@/components/chat/BotonVoz';
import { useConfirmar } from '@/components/useConfirmar';
import { useAsistente } from '@/lib/useAsistente';
import { useBotonHablar } from '@/lib/voz';
import '../chat/chat.css';

const SUGERENCIAS = [
  { icono: '🔥', titulo: 'Reportar una quema', texto: 'Están quemando basura en el lote de la calle 38 sur con carrera 80 en Kennedy, hay mucho humo' },
  { icono: '🌳', titulo: 'Reportar una tala', texto: 'Están talando un árbol grande en el parque de la carrera 7 con calle 120, en Usaquén, ahora mismo' },
  { icono: '🔊', titulo: '¿Cuánto ruido se permite?', texto: '¿Cuánto ruido se permite de noche en una zona residencial?' },
  { icono: '🌫️', titulo: 'Reporte de calidad del aire', texto: 'Hazme el reporte de aire de octubre 2026' },
];
const PIE: Record<string, string> = {
  plantilla: 'Respuesta escrita por el código con lo que devolvió la herramienta (no por el modelo).',
  codigo: 'Respuesta escrita por el código: el modelo no superó la verificación.',
};
const RADICADO = /\bRA-\d{4}-\d{5}\b/;

export default function AsistentePage() {
  const { preguntar, dialogo } = useConfirmar();
  const a = useAsistente(preguntar);
  const { leyendo, cargando, alternar } = useBotonHablar((m) => a.setAviso(m));
  const [texto, setTexto] = useState('');
  const raiz = useRef<HTMLElement>(null);
  const zona = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const selector = useRef<HTMLInputElement>(null);

  useEffect(() => { if (zona.current) zona.current.scrollTop = zona.current.scrollHeight; }, [a.mensajes, a.esperando]);
  useEffect(() => {
    const t = area.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
  }, [texto]);
  useLayoutEffect(() => {
    const ajustar = () => {
      const el = raiz.current;
      if (el) el.style.setProperty('--cl-alto', `${Math.max(480, window.innerHeight - el.getBoundingClientRect().top - window.scrollY - 16)}px`);
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);

  async function enviar(forzado?: string) {
    const t = forzado ?? texto;
    setTexto('');
    if (!(await a.enviar(t)) && !forzado) setTexto(t);
    area.current?.focus();
  }

  function alTeclear(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviar(); }
  }

  const hayAlgo = !!texto.trim() || a.pendientes.some((p) => p.estado === 'listo');

  return (
    <section className="cl cl-solo" ref={raiz}>
      <div className="cl-principal">
        <header className="cl-cabecera">
          <span className="cl-avatar agente" aria-hidden>A</span>
          <h2 className="cl-titulo">Agente ambiental de Bogotá <small className="cl-sub">reportes ciudadanos · calidad del aire</small></h2>
          <label className={`cl-interruptor ${a.porVoz ? 'activo' : ''}`} title="Leer en voz alta cada respuesta (Kokoro, local)">
            <input type="checkbox" checked={a.porVoz} onChange={(e) => a.setPorVoz(e.target.checked)} />
            <span aria-hidden>🔊</span> Responder por voz
          </label>
          <Link className="cl-boton-suave" href="/reportes-ciudadanos">Ver reportes</Link>
          <button type="button" className="cl-boton-suave" onClick={a.nueva} disabled={a.esperando}>Nueva</button>
        </header>

        <div className="cl-mensajes" ref={zona} aria-live="polite">
          <div className="cl-columna">
            {a.mensajes.length === 0 ? (
              <div className="cl-bienvenida">
                <div className="cl-avatar grande agente" aria-hidden>A</div>
                <h2>¿Qué problema ambiental quieres reportar?</h2>
                <p>
                  Cuéntamelo escribiendo o con el micrófono 🎤, y si puedes adjunta una foto 📎. Lo clasifico, te doy un radicado
                  y te digo a qué entidad le toca y por qué canal oficial ponerlo. Si hay fuego o alguien en peligro, llama ya al <b>123</b>.
                </p>
                <div className="cl-sugerencias">
                  {SUGERENCIAS.map((s) => (
                    <button key={s.titulo} type="button" disabled={a.esperando} onClick={() => enviar(s.texto)}>
                      <span className="cl-sug-icono" aria-hidden>{s.icono}</span>
                      <b>{s.titulo}</b>
                      <span>{s.texto}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              a.mensajes.map((m, i) => {
                if (m.rol === 'usuario') {
                  return (
                    <div key={i} className="cl-yo-grupo">
                      {!!m.adjuntos?.length && <div className="cl-yo-adjuntos">{m.adjuntos.map((x) => <AdjuntoEnviado key={x.id} a={x} />)}</div>}
                      <div className="cl-yo">{m.contenido}</div>
                    </div>
                  );
                }
                const clave = `m${i}`;
                const radicado = RADICADO.exec(m.contenido)?.[0];
                return (
                  <article key={i} className="cl-resp">
                    <span className="cl-avatar agente" aria-hidden>A</span>
                    <div className="cl-resp-cuerpo">
                      <header className="cl-resp-cab">
                        <b>Agente ambiental</b>
                        {m.herramientas.map((h, j) => <span key={j} className={`cl-etq ${h.error ? 'error' : ''}`} title={JSON.stringify(h.argumentos)}>🔧 {h.herramienta}</span>)}
                      </header>
                      <div className={`cl-texto-plano ${m.origen === 'error' ? 'error' : ''}`}>{m.contenido}</div>
                      {radicado && <Link className="cl-radicado" href={`/reportes-ciudadanos?radicado=${radicado}`}>📋 Ver el reporte {radicado}</Link>}
                      {m.origen && PIE[m.origen] && <p className="cl-contexto">{PIE[m.origen]}</p>}
                      {m.origen !== 'error' && (
                        <div className="cl-acciones visibles">
                          <button type="button" onClick={() => alternar(m.contenido, clave)} disabled={cargando === clave}>
                            {cargando === clave ? 'Preparando voz…' : leyendo === clave ? '■ Detener' : '🔊 Escuchar'}
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })
            )}
            {a.esperando && (
              <article className="cl-resp">
                <span className="cl-avatar agente" aria-hidden>A</span>
                <div className="cl-resp-cuerpo"><span className="cl-pensando" aria-label="Pensando"><i /><i /><i /></span> <small className="cl-contexto">si genera un reporte del aire puede tardar unos minutos</small></div>
              </article>
            )}
          </div>
        </div>

        <div className="cl-abajo">
          {a.aviso && (
            <div className="cl-aviso" role="alert">
              <span>{a.aviso}</span>
              <button type="button" onClick={() => a.setAviso(null)} aria-label="Cerrar aviso">✕</button>
            </div>
          )}
          <form className="cl-compositor" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
            {a.pendientes.length > 0 && <div className="cl-chips">{a.pendientes.map((p) => <ChipPendiente key={p.clave} p={p} alQuitar={() => a.quitar(p.clave)} />)}</div>}
            <textarea
              ref={area} rows={1} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={alTeclear}
              onPaste={(e) => { const f = [...e.clipboardData.files]; if (f.length) { e.preventDefault(); a.adjuntar(f); } }}
              placeholder="Cuéntame qué pasa y dónde, o pulsa 🎤 para decirlo…" aria-label="Mensaje para el agente"
            />
            <div className="cl-herramientas">
              <input ref={selector} type="file" multiple hidden accept="image/png,image/jpeg,image/gif,image/webp,audio/*,.pdf,.docx,.txt"
                onChange={(e) => { a.adjuntar([...(e.target.files ?? [])]); e.target.value = ''; }} />
              <button type="button" className="cl-herr-boton" onClick={() => selector.current?.click()} disabled={a.esperando} title="Adjuntar evidencia: foto, audio o documento" aria-label="Adjuntar evidencia">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path fill="currentColor" d="M16.5 6.5v10a4.5 4.5 0 0 1-9 0V5a3 3 0 0 1 6 0v10.5a1.5 1.5 0 0 1-3 0V6.5H9v9a3 3 0 0 0 6 0V5a4.5 4.5 0 0 0-9 0v11.5a6 6 0 0 0 12 0v-10h-1.5Z" /></svg>
              </button>
              <BotonVoz chat={a} voz={a.voz} alTranscribir={(t) => { setTexto((v) => (v.trim() ? `${v.trimEnd()} ${t}` : t)); area.current?.focus(); }} />
              <span className="cl-espacio" />
              <button className="cl-enviar" type="submit" disabled={a.esperando || a.subiendo || a.transcribiendo || !hayAlgo} aria-label="Enviar" title="Enviar">↑</button>
            </div>
          </form>
          <p className="cl-pie">
            Lo que dices y adjuntas aquí no sale del PC (Ollama, Whisper y Kokoro son locales). La clasificación, la prioridad y la entidad las decide el código con reglas, no el modelo.
          </p>
        </div>
      </div>
      {dialogo}
    </section>
  );
}

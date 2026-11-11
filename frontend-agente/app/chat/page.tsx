'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import BarraLateral from '@/components/chat/BarraLateral';
import Compositor from '@/components/chat/Compositor';
import Mensaje from '@/components/chat/Mensaje';
import { nombreModelo, PROVEEDOR } from '@/lib/chat';
import { useChatLibre } from '@/lib/useChatLibre';
import './chat.css';

const SUGERENCIAS = [
  { icono: '🌫️', titulo: 'Explícame el PM2.5', texto: 'Explícame qué es el PM2.5, de dónde sale en Bogotá y por qué importa para la salud' },
  { icono: '🧠', titulo: 'Sistemas expertos', texto: 'Resume en 5 puntos cómo funciona un sistema experto y en qué se diferencia de un LLM' },
  { icono: '💻', titulo: 'Escribe código', texto: 'Escribe una función en TypeScript que calcule la media móvil de 8 horas de una serie horaria' },
  { icono: '🔎', titulo: 'RAG vs. ajuste fino', texto: '¿Qué diferencia hay entre RAG y ajuste fino (fine-tuning)? ¿Cuándo usar cada uno?' },
];

export default function ChatLibrePage() {
  const chat = useChatLibre();
  const [texto, setTexto] = useState('');
  const [instrucciones, setInstrucciones] = useState('');
  const [verInstrucciones, setVerInstrucciones] = useState(false);
  const [listaAbierta, setListaAbierta] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const profundidad = useRef(0); // dragenter/dragleave se disparan también en los hijos
  const raiz = useRef<HTMLElement>(null);
  const zona = useRef<HTMLDivElement>(null);
  const pegado = useRef(true); // si el usuario está al final, el scroll sigue al texto que llega
  const compositor = useRef<{ enfocar: () => void }>(null);

  useEffect(() => {
    if (pegado.current && zona.current) zona.current.scrollTop = zona.current.scrollHeight;
  }, [chat.mensajes]);

  // El chat ocupa justo lo que queda de pantalla bajo la cabecera de la aplicación (sin scroll de página).
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
    if (!t.trim() && !chat.pendientes.some((p) => p.estado === 'listo')) return;
    pegado.current = true;
    setTexto('');
    const ok = await chat.enviar(t, instrucciones);
    if (!ok) setTexto(t); // rechazado antes de empezar: el texto vuelve a la caja
    compositor.current?.enfocar();
  }

  const nuevo = () => { chat.nuevo(); setListaAbierta(false); compositor.current?.enfocar(); };
  const abrir = (id: string) => { pegado.current = true; chat.abrir(id); setListaAbierta(false); };
  const vacio = chat.mensajes.length === 0;
  const nombreProveedor = PROVEEDOR[chat.seleccion.proveedor].nombre;

  return (
    <section className="cl" ref={raiz}>
      <BarraLateral
        conversaciones={chat.conversaciones} actualId={chat.actual.id} proveedores={chat.proveedores} bloqueado={chat.generando}
        abierta={listaAbierta} alCerrar={() => setListaAbierta(false)} alNuevo={nuevo} alAbrir={abrir} alBorrar={chat.borrar}
      />

      <div
        className="cl-principal"
        onDragEnter={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); profundidad.current += 1; setArrastrando(true); } }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        onDragLeave={() => { profundidad.current = Math.max(0, profundidad.current - 1); if (!profundidad.current) setArrastrando(false); }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          profundidad.current = 0;
          setArrastrando(false);
          if (!chat.generando) chat.adjuntar([...e.dataTransfer.files]);
        }}
      >
        {arrastrando && (
          <div className="cl-soltar" aria-hidden>
            <div><span>📎</span><b>Suelta para adjuntar</b><small>PDF, Word, Excel, CSV, texto, código, imágenes o audio · se guardan en tu base y se indexan</small></div>
          </div>
        )}
        <header className="cl-cabecera">
          <button type="button" className="cl-icono cl-solo-movil" onClick={() => setListaAbierta(true)} aria-label="Ver conversaciones">☰</button>
          <h2 className="cl-titulo" title={chat.actual.titulo}>{chat.actual.titulo}</h2>
          <button
            type="button" className={`cl-boton-suave ${verInstrucciones || instrucciones ? 'activo' : ''}`}
            onClick={() => setVerInstrucciones((v) => !v)} aria-expanded={verInstrucciones}
          >
            ⚙ Instrucciones{instrucciones && !verInstrucciones ? ' · activas' : ''}
          </button>
        </header>

        {verInstrucciones && (
          <div className="cl-instrucciones">
            <label htmlFor="cl-instr">Cómo quieres que responda (se aplica a los mensajes que envíes desde ahora)</label>
            <textarea id="cl-instr" rows={2} value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)}
              placeholder="Ej.: responde como profesor de ingeniería ambiental, con ejemplos de Bogotá y sin tecnicismos" />
          </div>
        )}

        <div className="cl-mensajes" ref={zona} aria-live="polite"
          onScroll={(e) => { const z = e.currentTarget; pegado.current = z.scrollHeight - z.scrollTop - z.clientHeight < 80; }}>
          <div className="cl-columna">
            {vacio ? (
              <div className="cl-bienvenida">
                <div className={`cl-avatar grande ${chat.seleccion.proveedor}`} aria-hidden>{PROVEEDOR[chat.seleccion.proveedor].inicial}</div>
                <h2>¿En qué te ayudo hoy?</h2>
                <p>
                  Estás hablando con <b>{nombreModelo(chat.proveedores, chat.seleccion.proveedor, chat.seleccion.modelo) || nombreProveedor}</b>.
                  Cambia de modelo o de capacidad abajo, cuando quieras. Para reportes y la norma con cifras verificadas, usa el <a href="/asistente">Asistente</a>.
                </p>
                <div className="cl-sugerencias">
                  {SUGERENCIAS.map((s) => (
                    <button key={s.titulo} type="button" disabled={!chat.estado?.disponible || chat.generando} onClick={() => enviar(s.texto)}>
                      <span className="cl-sug-icono" aria-hidden>{s.icono}</span>
                      <b>{s.titulo}</b>
                      <span>{s.texto}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chat.mensajes.map((m, i) => (
                <Mensaje
                  key={m.id ?? `t${i}`} mensaje={m} nombreModelo={nombreModelo(chat.proveedores, m.proveedor, m.modelo)}
                  escribiendo={chat.generando && i === chat.mensajes.length - 1 && m.rol === 'asistente'}
                />
              ))
            )}
          </div>
        </div>

        <div className="cl-abajo">
          {chat.aviso && (
            <div className="cl-aviso" role="alert">
              <span>{chat.aviso}</span>
              <button type="button" onClick={() => chat.setAviso(null)} aria-label="Cerrar aviso">✕</button>
            </div>
          )}
          {chat.estado && !chat.estado.disponible && !chat.aviso && (
            <div className="cl-aviso ambar" role="status"><span>{chat.estado.nombre}: {chat.estado.nota}</span></div>
          )}
          <Compositor ref={compositor} chat={chat} texto={texto} alCambiarTexto={setTexto} alEnviar={() => enviar()} />
          <p className="cl-pie">
            <span className="cl-atajo">Enter envía · Shift+Enter, nueva línea · </span>
            Los modelos pueden equivocarse. Este chat no verifica cifras; el Asistente sí.
          </p>
        </div>
      </div>
    </section>
  );
}

'use client';

import { memo, useState } from 'react';
import Markdown from '@/components/Markdown';
import { duracion, ESFUERZO, MensajeChat, PROVEEDOR, UsoContexto } from '@/lib/chat';
import { useBotonHablar } from '@/lib/voz';
import { AdjuntoEnviado } from './Adjunto';

/** Cómo usó el modelo los archivos de la conversación (solo se sabe en vivo). */
function textoContexto(c: UsoContexto): string | null {
  if (!c.archivos) return null;
  const archivos = `${c.archivos} archivo${c.archivos === 1 ? '' : 's'}`;
  if (c.modo === 'fragmentos') return `📚 ${archivos}: no cabían enteros, recibió los ${c.fragmentos} fragmentos más relevantes (búsqueda vectorial)`;
  if (c.modo === 'recortado') return `📚 ${archivos}: recortados para que cupieran (la búsqueda vectorial no estaba disponible)`;
  return `📚 Leyó ${archivos} completo${c.archivos === 1 ? '' : 's'}`;
}

interface Props {
  mensaje: MensajeChat;
  nombreModelo: string;
  escribiendo: boolean;
}

function Mensaje({ mensaje: m, nombreModelo, escribiendo }: Props) {
  const [copiado, setCopiado] = useState(false);
  const voz = useBotonHablar();
  const clave = `chat-${m.id ?? m.contenido.length}`;

  if (m.rol === 'usuario') {
    return (
      <div className="cl-yo-grupo">
        {!!m.adjuntos?.length && <div className="cl-yo-adjuntos">{m.adjuntos.map((a) => <AdjuntoEnviado key={a.id} a={a} />)}</div>}
        {m.contenido && <div className="cl-yo">{m.contenido}</div>}
      </div>
    );
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(m.contenido);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch { /* el navegador no dejó copiar */ }
  }

  const pensando = escribiendo && !m.contenido;
  return (
    <article className="cl-resp">
      <span className={`cl-avatar ${m.proveedor}`} aria-hidden>{PROVEEDOR[m.proveedor]?.inicial ?? '?'}</span>
      <div className="cl-resp-cuerpo">
        <header className="cl-resp-cab">
          <b>{nombreModelo}</b>
          {m.esfuerzo && <span className="cl-etq">Capacidad {ESFUERZO[m.esfuerzo]?.corto.toLowerCase() ?? m.esfuerzo}</span>}
          {m.duracion_ms != null && <span>{duracion(m.duracion_ms)}</span>}
        </header>
        {m.contexto && textoContexto(m.contexto) && <p className="cl-contexto">{textoContexto(m.contexto)}</p>}

        {m.razonamiento && (
          <details className="cl-razon" open={pensando}>
            <summary>{pensando ? 'Razonando…' : 'Ver cómo lo razonó'}</summary>
            <div>{m.razonamiento}</div>
          </details>
        )}
        {m.contenido && <Markdown texto={m.contenido} />}
        {pensando && !m.razonamiento && (
          <span className="cl-pensando" aria-label="Pensando"><i /><i /><i /></span>
        )}
        {escribiendo && m.contenido && <span className="cl-cursor" aria-hidden />}
        {m.error && <div className={`cl-error ${m.error.startsWith('Detenido') ? 'suave' : ''}`}>{m.error}</div>}

        {!escribiendo && m.contenido && (
          <div className="cl-acciones">
            <button type="button" onClick={copiar}>{copiado ? '✓ Copiado' : 'Copiar'}</button>
            <button type="button" onClick={() => voz.alternar(m.contenido, clave)} disabled={voz.cargando === clave}>
              {voz.cargando === clave ? 'Preparando…' : voz.leyendo === clave ? '■ Detener' : '🔊 Escuchar'}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export default memo(Mensaje);

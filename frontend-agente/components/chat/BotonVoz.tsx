'use client';

import { useEffect } from 'react';
import type { EstadoVoz } from '@/lib/chat';
import { useGrabadora } from '@/lib/useGrabadora';
import type { Grabacion } from '@/lib/useGrabadora';

/** Lo que el botón necesita de quien lo usa (el chat libre o el agente de reportes). */
export interface ControlVoz {
  generando: boolean;
  transcribiendo: boolean;
  setAviso: (m: string | null) => void;
  dictar: (g: Grabacion) => Promise<string | null>;
}

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

interface Props {
  chat: ControlVoz;
  voz: EstadoVoz | null;
  /** Se llama con el texto transcrito para añadirlo a la caja. */
  alTranscribir: (texto: string) => void;
}

/** Micrófono: pulsar para grabar, pulsar otra vez para transcribir con Whisper local. Esc cancela. */
export default function BotonVoz({ chat, voz, alTranscribir }: Props) {
  const g = useGrabadora();
  const ocupado = chat.generando || chat.transcribiendo;

  useEffect(() => {
    if (!g.grabando) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') g.cancelar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [g.grabando, g]);

  useEffect(() => { if (g.error) { chat.setAviso(g.error); g.limpiarError(); } }, [g.error, g, chat]);

  async function alternar() {
    if (g.grabando) {
      const grabacion = await g.detener();
      if (!grabacion) return;
      if (grabacion.segundos < 1) { chat.setAviso('La grabación fue demasiado corta.'); return; }
      const texto = await chat.dictar(grabacion);
      if (texto) alTranscribir(texto);
    } else {
      await g.empezar();
    }
  }

  if (chat.transcribiendo) {
    return <span className="cl-voz transcribiendo" role="status"><span className="rueda" />Transcribiendo…</span>;
  }
  if (g.grabando) {
    return (
      <span className="cl-voz grabando" role="status">
        <span className="cl-voz-punto" style={{ transform: `scale(${1 + g.nivel * 0.9})` }} aria-hidden />
        <span className="cl-voz-tiempo">{reloj(g.segundos)}</span>
        <button type="button" className="cl-voz-cancelar" onClick={g.cancelar} title="Cancelar (Esc)" aria-label="Cancelar grabación">✕</button>
        <button type="button" className="cl-voz-listo" onClick={alternar} title="Terminar y transcribir">✓ Listo</button>
      </span>
    );
  }
  const disponible = !!voz?.disponible;
  return (
    <button
      type="button" className="cl-herr-boton" onClick={alternar} disabled={ocupado || !disponible}
      title={disponible ? 'Dictar con el micrófono (Whisper local, el audio no sale del PC)' : (voz?.nota ?? 'Comprobando el servicio de voz…')}
      aria-label="Dictar con el micrófono"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" /></svg>
    </button>
  );
}

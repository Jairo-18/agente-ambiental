'use client';

import { ClipboardEvent, forwardRef, KeyboardEvent, useEffect, useImperativeHandle, useRef } from 'react';
import { ACEPTA_ARCHIVOS, PROVEEDOR } from '@/lib/chat';
import type { ChatLibre } from '@/lib/useChatLibre';
import { ChipPendiente } from './Adjunto';
import BotonVoz from './BotonVoz';
import SelectorEsfuerzo from './SelectorEsfuerzo';
import SelectorModelo from './SelectorModelo';

interface Props {
  chat: ChatLibre;
  texto: string;
  alCambiarTexto: (t: string) => void;
  alEnviar: () => void;
}

/** Caja de escritura: texto, archivos (📎, pegar o arrastrar), dictado por voz, modelo, capacidad y enviar / detener. */
const Compositor = forwardRef<{ enfocar: () => void }, Props>(function Compositor({ chat, texto, alCambiarTexto, alEnviar }, ref) {
  const area = useRef<HTMLTextAreaElement>(null);
  const selector = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ enfocar: () => area.current?.focus() }));

  useEffect(() => {
    const t = area.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 240)}px`;
  }, [texto]);

  const { estado, modeloInfo, seleccion, generando, pendientes, bloqueoAdjuntos } = chat;
  const listo = !!estado?.disponible && !!seleccion.modelo;
  const hayAlgo = !!texto.trim() || pendientes.some((p) => p.estado === 'listo');

  function alTeclear(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      alEnviar();
    }
  }

  /** Pegar una captura de pantalla (o un archivo copiado) la adjunta. */
  function alPegar(e: ClipboardEvent<HTMLTextAreaElement>) {
    const archivos = [...e.clipboardData.files];
    if (archivos.length) { e.preventDefault(); chat.adjuntar(archivos); }
  }

  const anadirTexto = (t: string) => {
    alCambiarTexto(texto.trim() ? `${texto.trimEnd()} ${t}` : t);
    area.current?.focus();
  };

  return (
    <form className="cl-compositor" onSubmit={(e) => { e.preventDefault(); alEnviar(); }}>
      {pendientes.length > 0 && (
        <div className="cl-chips">
          {pendientes.map((p) => <ChipPendiente key={p.clave} p={p} alQuitar={() => chat.quitar(p.clave)} />)}
        </div>
      )}
      <textarea
        ref={area} rows={1} value={texto} onChange={(e) => alCambiarTexto(e.target.value)} onKeyDown={alTeclear} onPaste={alPegar}
        placeholder={listo ? `Escribe, dicta 🎤 o adjunta 📎 para ${PROVEEDOR[seleccion.proveedor].nombre}…` : 'Elige un modelo disponible para empezar'}
        aria-label="Mensaje" disabled={!listo}
      />
      {bloqueoAdjuntos && <p className="cl-bloqueo">{bloqueoAdjuntos}</p>}
      <div className="cl-herramientas">
        <input
          ref={selector} type="file" multiple hidden accept={ACEPTA_ARCHIVOS}
          onChange={(e) => { chat.adjuntar([...(e.target.files ?? [])]); e.target.value = ''; }}
        />
        <button type="button" className="cl-herr-boton" onClick={() => selector.current?.click()} disabled={generando} title="Adjuntar archivos: PDF, Word, Excel, CSV, texto, código, imágenes o audio" aria-label="Adjuntar archivos">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path fill="currentColor" d="M16.5 6.5v10a4.5 4.5 0 0 1-9 0V5a3 3 0 0 1 6 0v10.5a1.5 1.5 0 0 1-3 0V6.5H9v9a3 3 0 0 0 6 0V5a4.5 4.5 0 0 0-9 0v11.5a6 6 0 0 0 12 0v-10h-1.5Z" /></svg>
        </button>
        <BotonVoz chat={chat} voz={chat.voz} alTranscribir={anadirTexto} />
        <SelectorModelo proveedores={chat.proveedores} seleccion={seleccion} bloqueado={generando} alElegir={chat.elegirModelo} alRecargar={chat.recargarProveedores} />
        <SelectorEsfuerzo niveles={modeloInfo?.esfuerzos ?? []} valor={seleccion.esfuerzo} bloqueado={generando} alCambiar={chat.elegirEsfuerzo} />
        <span className="cl-espacio" />
        {generando
          ? <button className="cl-enviar detener" type="button" onClick={chat.detener} aria-label="Detener" title="Detener">■</button>
          : <button className="cl-enviar" type="submit" disabled={!listo || !hayAlgo || !!bloqueoAdjuntos || chat.transcribiendo} aria-label="Enviar" title="Enviar">↑</button>}
      </div>
    </form>
  );
});

export default Compositor;

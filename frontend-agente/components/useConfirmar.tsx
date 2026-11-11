'use client';

import { useCallback, useRef, useState } from 'react';

/** Diálogo de confirmación como promesa: `const ok = await preguntar('¿Seguro?')`. */
export function useConfirmar() {
  const [texto, setTexto] = useState<string | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const preguntar = useCallback(
    (pregunta: string) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setTexto(pregunta);
      }),
    [],
  );
  const cerrar = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setTexto(null);
  };

  const dialogo =
    texto === null ? null : (
      <dialog
        ref={(d) => {
          if (d && !d.open) d.showModal();
        }}
        onCancel={() => cerrar(false)}
      >
        <p style={{ marginTop: 0, whiteSpace: 'pre-line' }}>{texto}</p>
        <div className="acciones" style={{ justifyContent: 'flex-end' }}>
          <button className="sec" onClick={() => cerrar(false)}>No</button>
          <button className="prim" onClick={() => cerrar(true)} autoFocus>Sí</button>
        </div>
      </dialog>
    );
  return { preguntar, dialogo };
}

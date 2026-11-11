'use client';

import { useEffect, useRef, useState } from 'react';
import { ESFUERZO, EstadoProveedor, ModeloInfo, PROVEEDOR, ProveedorId } from '@/lib/chat';
import type { Seleccion } from '@/lib/useChatLibre';

interface Props {
  proveedores: EstadoProveedor[] | null;
  seleccion: Seleccion;
  bloqueado: boolean;
  alElegir: (proveedor: ProveedorId, modelo: string) => void;
  alRecargar: () => void;
}

const rango = (m: ModeloInfo) =>
  m.esfuerzos.length ? `Capacidad ${ESFUERZO[m.esfuerzos[0]].corto.toLowerCase()} – ${ESFUERZO[m.esfuerzos[m.esfuerzos.length - 1]].corto.toLowerCase()}` : null;

/** Botón con el modelo actual que abre un panel: pestañas por proveedor y sus modelos agrupados. */
export default function SelectorModelo({ proveedores, seleccion, bloqueado, alElegir, alRecargar }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<ProveedorId>(seleccion.proveedor);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => { if (abierto) setPestana(seleccion.proveedor); }, [abierto, seleccion.proveedor]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', escape); };
  }, [abierto]);

  const actual = proveedores?.find((p) => p.id === seleccion.proveedor)?.modelos.find((m) => m.id === seleccion.modelo);
  const vista = proveedores?.find((p) => p.id === pestana);
  const grupos = new Map<string, ModeloInfo[]>();
  for (const m of vista?.modelos ?? []) grupos.set(m.grupo, [...(grupos.get(m.grupo) ?? []), m]);

  return (
    <div className="cl-selector" ref={raiz}>
      <button type="button" className="cl-selector-boton" onClick={() => setAbierto((v) => !v)} disabled={bloqueado || !proveedores} aria-haspopup="dialog" aria-expanded={abierto}>
        <span className={`cl-avatar mini ${seleccion.proveedor}`} aria-hidden>{PROVEEDOR[seleccion.proveedor].inicial}</span>
        <span className="cl-selector-texto">{proveedores ? (actual?.nombre ?? 'Elige un modelo') : 'Cargando…'}</span>
        <span className="cl-chevron" aria-hidden>▾</span>
      </button>

      {abierto && vista && (
        <div className="cl-panel-modelos" role="dialog" aria-label="Elegir modelo">
          <div className="cl-pestanas" role="tablist">
            {(proveedores ?? []).map((p) => (
              <button key={p.id} type="button" role="tab" aria-selected={pestana === p.id} className={pestana === p.id ? 'activa' : ''} onClick={() => setPestana(p.id)}>
                <span className={`cl-estado ${p.disponible ? 'ok' : 'mal'}`} aria-hidden />
                <span><b>{PROVEEDOR[p.id].nombre}</b><small>{PROVEEDOR[p.id].detalle}</small></span>
              </button>
            ))}
          </div>

          <div className="cl-modelos" role="listbox" aria-label={`Modelos de ${vista.nombre}`}>
            {!vista.disponible && (
              <div className="cl-no-disponible">
                <p>{vista.nota ?? 'No está disponible.'}</p>
                <button type="button" className="sec" onClick={alRecargar}>Volver a comprobar</button>
              </div>
            )}
            {vista.disponible && [...grupos.entries()].map(([grupo, lista]) => (
              <section key={grupo}>
                <h4>{grupo}</h4>
                {lista.map((m) => {
                  const elegido = seleccion.proveedor === vista.id && seleccion.modelo === m.id;
                  return (
                    <button
                      key={m.id} type="button" role="option" aria-selected={elegido} className={`cl-modelo-op ${elegido ? 'elegido' : ''}`}
                      onClick={() => { alElegir(vista.id, m.id); setAbierto(false); }}
                    >
                      <span className="cl-modelo-nombre">{m.nombre}{elegido && <span className="cl-check" aria-hidden>✓</span>}</span>
                      {m.descripcion && <span className="cl-modelo-desc">{m.descripcion}</span>}
                      <span className="cl-modelo-meta">
                        <code>{m.id}</code>
                        {rango(m) && <span>{rango(m)}</span>}
                      </span>
                    </button>
                  );
                })}
              </section>
            ))}
          </div>
          {vista.disponible && vista.nota && <p className="cl-panel-nota">{vista.nota}</p>}
        </div>
      )}
    </div>
  );
}

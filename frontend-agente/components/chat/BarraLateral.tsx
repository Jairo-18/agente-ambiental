'use client';

import { useMemo, useState } from 'react';
import { ConversacionFila, EstadoProveedor, PROVEEDOR } from '@/lib/chat';

const DIA = 86_400_000;

/** Hoy, Ayer, Últimos 7 días, Este mes, Anteriores. */
function grupoDe(iso: string, ahora: Date): string {
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
  const t = new Date(iso).getTime();
  if (t >= inicioHoy) return 'Hoy';
  if (t >= inicioHoy - DIA) return 'Ayer';
  if (t >= inicioHoy - 6 * DIA) return 'Últimos 7 días';
  if (t >= new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime()) return 'Este mes';
  return 'Anteriores';
}

interface Props {
  conversaciones: ConversacionFila[];
  actualId?: string;
  proveedores: EstadoProveedor[] | null;
  bloqueado: boolean;
  abierta: boolean;
  alCerrar: () => void;
  alNuevo: () => void;
  alAbrir: (id: string) => void;
  alBorrar: (c: ConversacionFila) => void;
}

export default function BarraLateral({ conversaciones, actualId, proveedores, bloqueado, abierta, alCerrar, alNuevo, alAbrir, alBorrar }: Props) {
  const [busqueda, setBusqueda] = useState('');

  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const ahora = new Date();
    const res = new Map<string, ConversacionFila[]>();
    for (const c of conversaciones) {
      if (q && !c.titulo.toLowerCase().includes(q)) continue;
      const g = grupoDe(c.actualizada_en, ahora);
      res.set(g, [...(res.get(g) ?? []), c]);
    }
    return [...res.entries()];
  }, [conversaciones, busqueda]);

  return (
    <>
      {abierta && <div className="cl-velo" onClick={alCerrar} aria-hidden />}
      <aside className={`cl-lado ${abierta ? 'abierta' : ''}`} aria-label="Conversaciones">
        <div className="cl-lado-cab">
          <button className="cl-nuevo" type="button" onClick={alNuevo} disabled={bloqueado}>
            <span aria-hidden>＋</span> Chat nuevo
          </button>
          <button className="cl-icono cl-solo-movil" type="button" onClick={alCerrar} aria-label="Cerrar lista">✕</button>
        </div>
        <input className="cl-buscar" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar conversaciones" aria-label="Buscar conversaciones" />

        <nav className="cl-lista">
          {conversaciones.length === 0 && <p className="cl-lista-vacia">Tus conversaciones aparecerán aquí.</p>}
          {conversaciones.length > 0 && grupos.length === 0 && <p className="cl-lista-vacia">Nada coincide con «{busqueda}».</p>}
          {grupos.map(([grupo, lista]) => (
            <section key={grupo}>
              <h3 className="cl-grupo">{grupo}</h3>
              {lista.map((c) => (
                <div key={c.id} className={`cl-conv ${actualId === c.id ? 'activa' : ''}`}>
                  <button type="button" className="cl-conv-abrir" onClick={() => alAbrir(c.id)} disabled={bloqueado} title={c.titulo}>
                    <span className={`cl-punto ${c.proveedor}`} aria-label={PROVEEDOR[c.proveedor]?.nombre} />
                    <span className="cl-conv-titulo">{c.titulo}</span>
                  </button>
                  <button
                    type="button" className="cl-conv-borrar" disabled={bloqueado} aria-label={`Borrar ${c.titulo}`} title="Borrar"
                    onClick={() => confirm(`¿Borrar «${c.titulo}»?`) && alBorrar(c)}
                  >🗑</button>
                </div>
              ))}
            </section>
          ))}
        </nav>

        <footer className="cl-lado-pie" aria-label="Estado de los proveedores">
          {(proveedores ?? []).map((p) => (
            <span key={p.id} className="cl-pie-prov" title={p.nota ?? ''}>
              <span className={`cl-estado ${p.disponible ? 'ok' : 'mal'}`} aria-hidden />
              {PROVEEDOR[p.id].nombre}
            </span>
          ))}
        </footer>
      </aside>
    </>
  );
}

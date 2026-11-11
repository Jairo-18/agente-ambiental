'use client';

import { AdjuntoVista, tamanoLegible, urlAdjunto } from '@/lib/chat';
import type { Pendiente } from '@/lib/useChatLibre';

const ICONO: Record<AdjuntoVista['tipo'], string> = { documento: '📄', imagen: '🖼️', audio: '🎙️' };

function detalle(a: AdjuntoVista): string {
  const partes = [tamanoLegible(a.tamano)];
  if (a.tipo === 'documento' && a.paginas) partes.push(a.mime.includes('sheet') ? `${a.paginas} hoja(s)` : `${a.paginas} pág.`);
  if (a.tipo === 'audio' && a.duracion_seg) partes.push(`${Math.round(a.duracion_seg)} s`);
  if (a.tipo === 'documento' && a.mime === 'application/pdf' && !a.caracteres) partes.push('sin texto (escaneado)');
  if (a.indexado && a.fragmentos) partes.push(`${a.fragmentos} fragmento${a.fragmentos === 1 ? '' : 's'} en la memoria`);
  else if (a.indexado) partes.push('en la memoria');
  return partes.join(' · ');
}

/** Archivo elegido para el próximo mensaje (subiendo, listo o con error), con botón para quitarlo. */
export function ChipPendiente({ p, alQuitar }: { p: Pendiente; alQuitar: () => void }) {
  return (
    <div className={`cl-chip ${p.estado}`} title={p.error ?? p.adjunto?.extracto ?? p.nombre}>
      {p.vistaPrevia ? <img src={p.vistaPrevia} alt="" className="cl-chip-mini" /> : <span className="cl-chip-icono" aria-hidden>{ICONO[p.tipo]}</span>}
      <span className="cl-chip-texto">
        <b>{p.nombre}</b>
        <small>{p.estado === 'subiendo' ? 'Subiendo y leyendo…' : p.estado === 'error' ? p.error : p.adjunto ? detalle(p.adjunto) : ''}</small>
      </span>
      {p.estado === 'subiendo' ? <span className="rueda" aria-label="Subiendo" /> : <button type="button" onClick={alQuitar} aria-label={`Quitar ${p.nombre}`}>✕</button>}
    </div>
  );
}

/** Archivo ya enviado, dentro de un mensaje: miniatura, reproductor o tarjeta con enlace para abrirlo. */
export function AdjuntoEnviado({ a }: { a: AdjuntoVista }) {
  if (a.tipo === 'imagen') {
    return (
      <a className="cl-adj-imagen" href={urlAdjunto(a.id)} target="_blank" rel="noreferrer" title={a.extracto ?? a.nombre}>
        <img src={urlAdjunto(a.id)} alt={a.extracto ?? a.nombre} loading="lazy" />
      </a>
    );
  }
  if (a.tipo === 'audio') {
    return (
      <div className="cl-adj-audio">
        <span aria-hidden>🎙️</span>
        <audio controls preload="none" src={urlAdjunto(a.id)} />
        <small>{a.dictado ? 'Nota de voz' : a.nombre}{a.duracion_seg ? ` · ${Math.round(a.duracion_seg)} s` : ''}</small>
      </div>
    );
  }
  return (
    <a className="cl-adj-doc" href={urlAdjunto(a.id)} target="_blank" rel="noreferrer" title={a.extracto ?? undefined}>
      <span className="cl-chip-icono" aria-hidden>{ICONO.documento}</span>
      <span className="cl-chip-texto"><b>{a.nombre}</b><small>{detalle(a)}</small></span>
    </a>
  );
}

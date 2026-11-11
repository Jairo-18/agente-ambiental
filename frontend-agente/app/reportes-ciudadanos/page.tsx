'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdjuntoEnviado } from '@/components/chat/Adjunto';
import { api, fechaLarga } from '@/lib/api';
import type { AdjuntoVista } from '@/lib/chat';

interface Fila {
  radicado: string;
  tipo: string;
  tipo_nombre: string;
  descripcion: string;
  direccion: string;
  localidad: string | null;
  barrio: string | null;
  cuando: string | null;
  en_curso: boolean;
  prioridad: 'alta' | 'media' | 'baja';
  puntaje: number;
  motivos_prioridad: string[];
  emergencia: boolean;
  entidad: string;
  canales_oficiales: string[];
  estado: string;
  canal: 'texto' | 'voz' | 'formulario';
  creado_en: string;
  clasificacion: { tipo_modelo: string | null; tipo_reglas: string };
  historial?: { estado: string; nota: string | null; autor: string; fecha: string }[];
  evidencias?: { id: string; tipo: AdjuntoVista['tipo']; nombre: string; texto: string | null }[];
}
interface Catalogo { tipos: { id: string; nombre: string }[]; localidades: string[]; estados: string[]; aviso_radicado: string }
interface Conteo { valor: string; n: number }
interface Estadisticas { total: number; abiertos: number; emergencias: number; prioridad: Conteo[]; tipo: Conteo[]; localidad: Conteo[] }

const COLOR_PRIORIDAD = { alta: 'rojo', media: 'ambar', baja: 'verde' } as const;
const ESTADO: Record<string, string> = { recibido: 'Recibido', en_revision: 'En revisión', remitido: 'Remitido', cerrado: 'Cerrado' };
const CANAL: Record<string, string> = { voz: '🎤 voz', texto: '⌨️ texto', formulario: '📝 formulario' };

/** Una evidencia del reporte con la forma que espera el componente de adjuntos. */
const comoAdjunto = (e: NonNullable<Fila['evidencias']>[number]): AdjuntoVista => ({
  id: e.id, tipo: e.tipo, nombre: e.nombre, mime: e.tipo === 'imagen' ? 'image/*' : e.tipo === 'audio' ? 'audio/*' : '', tamano: 0, paginas: null,
  duracion_seg: null, caracteres: e.texto?.length ?? 0, extracto: e.texto, dictado: e.tipo === 'audio', estado: 'listo', error: null, indexado: true,
});

export default function ReportesCiudadanos() {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [stats, setStats] = useState<Estadisticas | null>(null);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [filtros, setFiltros] = useState({ tipo: '', estado: '', prioridad: '', localidad: '' });
  const [detalle, setDetalle] = useState<Fila | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState('en_revision');
  const [nota, setNota] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'rojo' | 'verde'; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const q = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)).toString();
    try {
      const [l, s] = await Promise.all([api<Fila[]>(`/api/reportes-ciudadanos${q ? `?${q}` : ''}`), api<Estadisticas>('/api/reportes-ciudadanos/estadisticas')]);
      setFilas(l);
      setStats(s);
    } catch (e) {
      setAviso({ tipo: 'rojo', texto: (e as Error).message });
    }
  }, [filtros]);

  const abrir = useCallback(async (radicado: string) => {
    try {
      const d = await api<Fila>(`/api/reportes-ciudadanos/${radicado}`);
      setDetalle(d);
      setNuevoEstado(d.estado === 'recibido' ? 'en_revision' : d.estado);
      setNota('');
    } catch (e) {
      setAviso({ tipo: 'rojo', texto: (e as Error).message });
    }
  }, []);

  useEffect(() => { api<Catalogo>('/api/reportes-ciudadanos/catalogo').then(setCatalogo, () => undefined); }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get('radicado');
    if (r) abrir(r);
  }, [abrir]);

  async function guardarEstado() {
    if (!detalle) return;
    try {
      const d = await api<Fila>(`/api/reportes-ciudadanos/${detalle.radicado}/estado`, { estado: nuevoEstado, nota: nota || undefined });
      setDetalle(d);
      setNota('');
      setAviso({ tipo: 'verde', texto: `${d.radicado} quedó en «${ESTADO[d.estado]}».` });
      cargar();
    } catch (e) {
      setAviso({ tipo: 'rojo', texto: (e as Error).message });
    }
  }

  const alta = stats?.prioridad.find((p) => p.valor === 'alta')?.n ?? 0;
  const filtro = (campo: keyof typeof filtros, etiqueta: string, opciones: { v: string; t: string }[]) => (
    <label>
      {etiqueta}
      <select value={filtros[campo]} onChange={(e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }))}>
        <option value="">Todos</option>
        {opciones.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </label>
  );

  return (
    <>
      <section className="tarjeta">
        <h2>Reportes ciudadanos ambientales · Bogotá</h2>
        <div className="rejilla">
          <div className="dato"><b>{stats?.total ?? '—'}</b><span>reportes</span></div>
          <div className="dato"><b>{stats?.abiertos ?? '—'}</b><span>abiertos (sin cerrar)</span></div>
          <div className="dato"><b style={{ color: 'var(--rojo)' }}>{stats?.emergencias ?? '—'}</b><span>emergencias (se indicó llamar al 123)</span></div>
          <div className="dato"><b style={{ color: 'var(--ambar)' }}>{alta}</b><span>prioridad alta</span></div>
        </div>
        {stats && stats.tipo.length > 0 && (
          <p className="nota">Por tipo: {stats.tipo.map((t) => `${catalogo?.tipos.find((x) => x.id === t.valor)?.nombre ?? t.valor} (${t.n})`).join(' · ')}</p>
        )}
        {catalogo && <p className="nota">{catalogo.aviso_radicado}</p>}
        {aviso && <div className={`aviso ${aviso.tipo}`} role="status">{aviso.texto}</div>}
      </section>

      <section className="tarjeta">
        <div className="fila">
          {filtro('tipo', 'Tipo', (catalogo?.tipos ?? []).map((t) => ({ v: t.id, t: t.nombre })))}
          {filtro('prioridad', 'Prioridad', ['alta', 'media', 'baja'].map((p) => ({ v: p, t: p })))}
          {filtro('estado', 'Estado', (catalogo?.estados ?? []).map((e) => ({ v: e, t: ESTADO[e] ?? e })))}
          {filtro('localidad', 'Localidad', (catalogo?.localidades ?? []).map((l) => ({ v: l, t: l })))}
        </div>
        <div className="tabla" style={{ marginTop: 14 }}>
          <table>
            <thead>
              <tr><th>Radicado</th><th>Fecha</th><th>Tipo</th><th>Dónde</th><th>Prioridad</th><th>Estado</th><th>Canal</th></tr>
            </thead>
            <tbody>
              {filas?.length === 0 && <tr><td colSpan={7} className="nota">No hay reportes con esos filtros. Los ciudadanos reportan desde el Asistente.</td></tr>}
              {filas?.map((f) => (
                <tr key={f.radicado} onClick={() => abrir(f.radicado)} style={{ cursor: 'pointer', background: detalle?.radicado === f.radicado ? 'var(--acento-suave)' : undefined }}>
                  <td><b>{f.radicado}</b>{f.emergencia && <> <span className="etiqueta rojo">123</span></>}</td>
                  <td>{fechaLarga(f.creado_en)}</td>
                  <td>{f.tipo_nombre}</td>
                  <td>{f.localidad ?? '—'}<br /><small className="nota" style={{ margin: 0 }}>{f.direccion}</small></td>
                  <td><span className={`etiqueta ${COLOR_PRIORIDAD[f.prioridad]}`}>{f.prioridad}</span></td>
                  <td>{ESTADO[f.estado] ?? f.estado}</td>
                  <td>{CANAL[f.canal] ?? f.canal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {detalle && (
        <section className="tarjeta" id="detalle">
          <div className="acciones" style={{ marginTop: 0, justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>{detalle.radicado} · {detalle.tipo_nombre}</h2>
            <button type="button" className="sec" onClick={() => setDetalle(null)}>Cerrar</button>
          </div>
          {detalle.emergencia && <div className="aviso rojo">Emergencia: al ciudadano se le indicó llamar ya a la línea 123.</div>}
          <p className="resumen" style={{ marginTop: 12 }}>{detalle.descripcion}</p>
          <div className="rejilla" style={{ marginTop: 12 }}>
            <div className="dato"><span>Dónde</span><p style={{ margin: '4px 0 0' }}>{detalle.direccion}{detalle.localidad && !detalle.direccion.toLowerCase().includes(detalle.localidad.toLowerCase()) ? ` (${detalle.localidad})` : ''}</p></div>
            <div className="dato"><span>Cuándo</span><p style={{ margin: '4px 0 0' }}>{[detalle.cuando, detalle.en_curso ? 'estaba pasando cuando se reportó' : null].filter(Boolean).join(' · ') || '—'}</p></div>
            <div className="dato"><span>Le corresponde a</span><p style={{ margin: '4px 0 0' }}>{detalle.entidad}</p></div>
            <div className="dato"><span>Canal</span><p style={{ margin: '4px 0 0' }}>{CANAL[detalle.canal] ?? detalle.canal}</p></div>
          </div>

          <h3>Prioridad {detalle.prioridad} ({detalle.puntaje} puntos) — criterio del proyecto</h3>
          <ul className="limpia">{detalle.motivos_prioridad.map((m, i) => <li key={i}>{m}</li>)}</ul>
          <p className="nota">
            Clasificación: el modelo propuso <b>{detalle.clasificacion.tipo_modelo ?? '—'}</b>; las reglas dieron <b>{detalle.clasificacion.tipo_reglas}</b>.
          </p>

          <h3>Canales oficiales que se le indicaron</h3>
          <ul className="limpia">{detalle.canales_oficiales.map((c, i) => <li key={i}>{c}</li>)}</ul>

          {!!detalle.evidencias?.length && (
            <>
              <h3>Evidencias</h3>
              <div className="cl-yo-adjuntos" style={{ justifyContent: 'flex-start' }}>{detalle.evidencias.map((e) => <AdjuntoEnviado key={e.id} a={comoAdjunto(e)} />)}</div>
              {detalle.evidencias.filter((e) => e.texto).map((e) => (
                <p key={e.id} className="nota"><b>{e.tipo === 'imagen' ? 'Descripción de la foto' : e.tipo === 'audio' ? 'Transcripción' : e.nombre}:</b> {e.texto}</p>
              ))}
            </>
          )}

          <h3>Historial</h3>
          <ul className="limpia">
            {detalle.historial?.map((h, i) => <li key={i}><b>{ESTADO[h.estado] ?? h.estado}</b> · {fechaLarga(h.fecha)} · {h.autor}{h.nota ? ` — ${h.nota}` : ''}</li>)}
          </ul>

          <div className="fila" style={{ marginTop: 14 }}>
            <label>
              Cambiar estado
              <select value={nuevoEstado} onChange={(e) => setNuevoEstado(e.target.value)}>
                {(catalogo?.estados ?? []).map((e) => <option key={e} value={e}>{ESTADO[e] ?? e}</option>)}
              </select>
            </label>
            <label style={{ flex: '1 1 260px' }}>
              Nota (queda en el historial)
              <input type="text" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: remitido a la SDA por correo" />
            </label>
            <button type="button" className="prim" onClick={guardarEstado}>Guardar</button>
          </div>
        </section>
      )}
    </>
  );
}

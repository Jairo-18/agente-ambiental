'use client';

import { useEffect, useState } from 'react';
import { api, Fragmento, RespuestaNorma } from '@/lib/api';

interface EstadoIndice { fragmentos: number; ultimaIndexacion: string | null; modeloEmbeddings: string }

const EJEMPLOS = [
  '¿Cuál es el límite de PM10 en 24 horas y desde cuándo rige?',
  '¿Qué efectos en salud tiene un ICA entre 151 y 200?',
  '¿Cómo se pasa el ozono de ppb a µg/m3?',
  '¿Qué pasa con el NO2 entre 190 y 200 µg/m3?',
  '¿Cuál es el rango del ICA en la Tabla 6 para PM10?',
];
const ORIGEN: Record<RespuestaNorma['origen'], { texto: string; clase: string }> = {
  llm: { texto: 'Redactada por el modelo y verificada (citas y cifras)', clase: 'verde' },
  extractiva: { texto: 'El modelo no pasó la verificación: se muestran los fragmentos tal cual', clase: 'ambar' },
  sin_resultados: { texto: 'No está en la base de la norma', clase: 'gris' },
};

export default function Norma() {
  const [indice, setIndice] = useState<EstadoIndice | null>(null);
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState<RespuestaNorma | null>(null);
  const [hallazgos, setHallazgos] = useState<Fragmento[] | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargarIndice = () => api<EstadoIndice>('/api/norma/estado').then(setIndice, () => undefined);
  useEffect(() => { cargarIndice(); }, []);

  async function ejecutar<T>(texto: string, fn: () => Promise<T>, alTerminar: (r: T) => void) {
    setError(null); setOcupado(texto);
    try { alTerminar(await fn()); } catch (e) { setError((e as Error).message); } finally { setOcupado(null); }
  }
  const preguntar = (p = pregunta) => {
    setPregunta(p); setHallazgos(null); setRespuesta(null);
    return ejecutar('Buscando en la norma y redactando…', () => api<RespuestaNorma>('/api/norma/preguntar', { pregunta: p }), (r) => { setRespuesta(r); setAbierto(r.citas[0]?.clave ?? null); });
  };
  const buscar = () => {
    setRespuesta(null);
    return ejecutar('Buscando…', () => api<{ resultados: Fragmento[] }>(`/api/norma/buscar?k=6&q=${encodeURIComponent(pregunta)}`), (r) => setHallazgos(r.resultados));
  };
  const reindexar = () => ejecutar('Calculando embeddings de la norma…', () => api('/api/norma/indexar', {}), () => cargarIndice());

  const fragmento = (f: Fragmento) => (
    <div className="fragmento" key={f.clave}>
      <div className="fila" style={{ alignItems: 'center' }}>
        <strong>{f.titulo}</strong>
        <span className="etiqueta gris">{f.clave}</span>
        {!f.verificado && <span className="etiqueta ambar">supuesto del proyecto</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="barra" title={`similitud coseno ${f.similitud.toFixed(3)}`}><i style={{ width: `${Math.max(0, Math.min(1, f.similitud)) * 100}%` }} /></span>
          <small>{f.similitud.toFixed(2)}</small>
        </span>
      </div>
      <p>{f.texto}</p>
      <small>Fuente: {f.fuente}</small>
    </div>
  );

  return (
    <>
      <section className="tarjeta">
        <h2>Consultar la norma (búsqueda vectorial)</h2>
        <p className="nota" style={{ marginTop: 0 }}>
          La Resolución 2254 de 2017 está dividida en {indice?.fragmentos ?? '…'} fragmentos con su fuente, indexados en PostgreSQL con pgvector
          ({indice?.modeloEmbeddings}). El modelo solo responde con lo que recupera, cita cada afirmación con su clave, y si inventa una cifra o una cita se rechaza.
        </p>
        <label style={{ marginTop: 12 }}>
          Tu pregunta
          <textarea rows={2} value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="Ej.: ¿Cuál es el límite de PM2.5 en 24 horas?"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && pregunta.trim().length > 2) { e.preventDefault(); preguntar(); } }} />
        </label>
        <div className="acciones">
          <button className="prim" onClick={() => preguntar()} disabled={!!ocupado || pregunta.trim().length < 3}>Preguntar a la norma</button>
          <button className="sec" onClick={buscar} disabled={!!ocupado || pregunta.trim().length < 2}>Solo buscar fragmentos</button>
          <button className="sec" onClick={reindexar} disabled={!!ocupado} title="Vuelve a leer la base de conocimiento y recalcula los vectores">Reindexar</button>
        </div>
        <div className="ejemplos">{EJEMPLOS.map((e) => <button key={e} onClick={() => preguntar(e)} disabled={!!ocupado}>{e}</button>)}</div>
        {ocupado && <div className="aviso info"><span className="carga"><span className="rueda" />{ocupado}</span></div>}
        {error && <div className="aviso rojo">{error}</div>}
      </section>

      {respuesta && (
        <section className="tarjeta">
          <h2>Respuesta</h2>
          <span className={`etiqueta ${ORIGEN[respuesta.origen].clase}`}>{ORIGEN[respuesta.origen].texto}</span>
          {respuesta.intentos > 1 && <span className="nota"> · {respuesta.intentos} intentos</span>}
          <div className="resumen" style={{ marginTop: 10 }}>{respuesta.respuesta}</div>
          {respuesta.problemas.length > 0 && (
            <p className="nota">Intentos rechazados por el verificador: {respuesta.problemas.join(' | ')}</p>
          )}
          {respuesta.citas.length > 0 && (<>
            <h3>Citas</h3>
            <div className="fila" style={{ gap: 8 }}>
              {respuesta.citas.map((c) => <button key={c.clave} className="cita" onClick={() => setAbierto(abierto === c.clave ? null : c.clave)}>{c.clave}</button>)}
            </div>
            <div className="lista" style={{ marginTop: 10 }}>{respuesta.citas.filter((c) => c.clave === abierto).map(fragmento)}</div>
          </>)}
        </section>
      )}

      {hallazgos && (
        <section className="tarjeta">
          <h2>Fragmentos más cercanos</h2>
          <div className="lista">{hallazgos.map(fragmento)}</div>
        </section>
      )}
    </>
  );
}

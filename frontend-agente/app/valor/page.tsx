'use client';

import { useEffect, useState } from 'react';
import { api, fechaLarga, nivelTexto } from '@/lib/api';

const CONTAMINANTES = ['PM10', 'PM2.5', 'SO2', 'NO2', 'O3', 'CO'];
interface Resultado { estado: string; nivel_excepcional: string | null; conclusion: string; reglas: string[]; fuentes: string[]; explicacion: string[] }
interface Historial { id: number; contaminante: string; promedio: string; valor: number; unidad: string; estado: string; nivel: string | null; creada_en: string }

export default function EvaluarValor() {
  const [contaminante, setContaminante] = useState('PM2.5');
  const [promedio, setPromedio] = useState('24h');
  const [valor, setValor] = useState('41.29');
  const [unidad, setUnidad] = useState('µg/m3');
  const [r, setR] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<Historial[]>([]);

  const cargarHistorial = () => api<Historial[]>('/api/evaluaciones?limite=8').then(setHistorial, () => undefined);
  useEffect(() => { cargarHistorial(); }, []);

  async function evaluar() {
    setError(null); setR(null);
    if (valor.trim() === '' || Number.isNaN(Number(valor))) return setError('Escribe un valor numérico.');
    try {
      setR(await api<Resultado>('/api/evaluaciones', { contaminante, promedio, valor: Number(valor), unidad }));
      cargarHistorial();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const clase = r ? ({ excede: 'rojo', cumple: 'verde' } as Record<string, string>)[r.estado] ?? 'ambar' : '';

  return (
    <>
      <section className="tarjeta">
        <h2>¿Un valor cumple la norma?</h2>
        <p className="nota" style={{ marginTop: 0 }}>Lo evalúa el motor de reglas contra la Resolución 2254 de 2017 (nunca el modelo), con la regla y la fuente. Cada consulta queda guardada como registro de auditoría.</p>
        <div className="fila" style={{ marginTop: 12 }}>
          <label>Contaminante<select value={contaminante} onChange={(e) => setContaminante(e.target.value)}>{CONTAMINANTES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Promedio<select value={promedio} onChange={(e) => setPromedio(e.target.value)}><option>24h</option><option>8h</option><option>1h</option></select></label>
          <label>Valor<input type="number" step="any" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
          <label>Unidad<select value={unidad} onChange={(e) => setUnidad(e.target.value)}><option value="µg/m3">µg/m³</option><option>ppb</option><option>ppm</option></select></label>
        </div>
        <div className="acciones"><button className="prim" onClick={evaluar}>Evaluar</button></div>
        {error && <div className="aviso rojo">{error}</div>}
        {r && (<>
          <div className={`aviso ${clase}`}>{r.conclusion}</div>
          {r.nivel_excepcional && <div className="aviso ambar">Nivel excepcional: {nivelTexto(r.nivel_excepcional)}</div>}
          <h3>Cómo se llegó a esa conclusión</h3>
          <ul className="limpia">{r.explicacion.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <p className="nota">Reglas: {r.reglas.join(', ') || 'ninguna'}. Fuentes: {r.fuentes.join('; ') || 'ninguna'}.</p>
        </>)}
      </section>

      {historial.length > 0 && (
        <section className="tarjeta">
          <h2>Últimas evaluaciones</h2>
          <div className="tabla"><table>
            <thead><tr><th>Cuándo</th><th>Contaminante</th><th>Promedio</th><th className="num">Valor</th><th>Resultado</th></tr></thead>
            <tbody>{historial.map((h) => (
              <tr key={h.id}>
                <td>{fechaLarga(h.creada_en)}</td><td>{h.contaminante}</td><td>{h.promedio}</td><td className="num">{h.valor} {h.unidad}</td>
                <td><span className={`etiqueta ${h.estado === 'excede' ? 'rojo' : h.estado === 'cumple' ? 'verde' : 'ambar'}`}>{h.estado}{h.nivel ? ` · ${nivelTexto(h.nivel)}` : ''}</span></td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}

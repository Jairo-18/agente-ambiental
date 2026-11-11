'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, Detalle, fecha, fechaLarga, nivelTexto, num } from '@/lib/api';

interface Guardado {
  id: number;
  periodo: string;
  generado_en: string;
  archivo_datos: string;
  con_llm: boolean | null;
  origen: string;
  redaccion: Record<string, string>;
  detalle: Detalle;
}
interface Version { id: number; generado_en: string; archivo_datos: string; con_llm: boolean | null; origen: string; n_excedencias: number }

const ORIGEN: Record<string, string> = { llm: 'modelo (verificado)', plantilla: 'plantilla' };
const SECCION: Record<string, string> = {
  resumen: 'Resumen', conclusiones: 'Conclusiones', comentario_pm10: 'Comentario PM10', comentario_pm25: 'Comentario PM2.5', comentario_gases: 'Comentario gases',
};

export default function ReporteDetalle() {
  const { periodo } = useParams<{ periodo: string }>();
  const [g, setG] = useState<Guardado | null>(null);
  const [versiones, setVersiones] = useState<Version[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Guardado>(`/api/reportes/${periodo}`).then(setG, (e) => setError(e.message));
    api<Version[]>(`/api/reportes/${periodo}/versiones`).then(setVersiones, () => undefined);
  }, [periodo]);

  if (error) return <div className="tarjeta"><div className="aviso rojo">{error}</div><p><Link href="/">← Volver</Link></p></div>;
  if (!g) return <div className="tarjeta"><span className="carga"><span className="rueda" />Cargando…</span></div>;
  const d = g.detalle;
  const base = `/api/reportes/${periodo}/archivos`;
  const estado = (f: Detalle['filas'][number]): [string, string] => (!f.evaluable ? ['No evaluable', 'ambar'] : f.excedencias ? ['Excede', 'rojo'] : ['Cumple', 'verde']);
  const figuras = d.archivos.filter((a) => a.endsWith('.png'));

  return (
    <>
      <section className="tarjeta">
        <p style={{ margin: '0 0 8px' }}><Link href="/">← Reportes</Link></p>
        <h2 style={{ fontSize: 20 }}>Reporte de {d.mes}</h2>
        <div className="acciones" style={{ margin: '0 0 12px' }}>
          <a className="prim" href={`${base}/reporte.docx`}>Descargar DOCX</a>
          {d.archivos.includes('trazabilidad.md') && <a className="sec" target="_blank" rel="noopener" href={`${base}/trazabilidad.md`}>Ver trazabilidad</a>}
          {d.archivos.includes('hechos.json') && <a className="sec" target="_blank" rel="noopener" href={`${base}/hechos.json`}>Ver hechos (JSON)</a>}
        </div>
        <p className="nota" style={{ margin: '0 0 10px' }}>
          Guardado el {fechaLarga(g.generado_en)} · datos: {g.archivo_datos} · {g.origen === 'importado' ? 'importado del disco' : g.con_llm ? 'comentarios con modelo' : 'comentarios de plantilla'}
        </p>
        <div className="resumen">{d.resumen}</div>

        {d.excedencias.length > 0 && (<>
          <h3>Excedencias</h3>
          <ul className="limpia">{d.excedencias.map((x, i) => (
            <li key={i}>{x.estacion} · {x.contaminante} ({x.promedio}) el {fecha(x.fecha_hora)}: {num(x.valor_ugm3)} µg/m³ &gt; {num(x.limite_ugm3)} µg/m³ — regla {x.regla_id}</li>
          ))}</ul>
        </>)}
        {d.niveles.length > 0 && (<>
          <h3>Niveles de prevención, alerta o emergencia (Tabla 4)</h3>
          <ul className="limpia">{d.niveles.map((x, i) => (
            <li key={i}>{x.estacion} · {x.contaminante} ({x.promedio}) el {fecha(x.fecha_hora)}: {num(x.valor_ugm3)} µg/m³ → nivel de {nivelTexto(x.nivel)}</li>
          ))}</ul>
        </>)}

        <h3>Resultados por estación y contaminante</h3>
        <div className="tabla"><table>
          <thead><tr><th>Estación</th><th>Contaminante</th><th className="num">Datos válidos</th><th className="num">Media mensual</th><th>Máximos (µg/m³)</th><th>Estado</th></tr></thead>
          <tbody>{d.filas.map((f, i) => {
            const [t, c] = estado(f);
            return (
              <tr key={i}>
                <td>{f.estacion}</td><td>{f.contaminante}</td><td className="num">{num(f.representatividad)} %</td>
                <td className="num">{f.media == null ? '—' : num(f.media)}</td>
                <td>{f.maximos.length ? f.maximos.map((m, j) => <div key={j}>{m.promedio}: {num(m.valor)} ({fecha(m.fecha)})</div>) : '—'}</td>
                <td><span className={`etiqueta ${c}`}>{t}</span></td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <p className="nota">“No evaluable”: menos de 75 % de horas válidas; los valores son solo indicativos y no se declara cumplimiento.</p>

        {d.advertencias.length > 0 && (<>
          <h3>Advertencias del control de calidad</h3>
          <ul className="limpia">{d.advertencias.map((a, i) => <li key={i}>{a.mensaje}</li>)}</ul>
        </>)}

        {figuras.length > 0 && (<>
          <h3>Gráficos</h3>
          <div className="figuras">{figuras.map((a) => <img key={a} src={`${base}/${a}`} alt={`Gráfico ${a.replace('.png', '').replace(/_/g, ' ')}`} />)}</div>
        </>)}
      </section>

      {Object.keys(g.redaccion).length > 0 && (
        <section className="tarjeta">
          <h2>Quién escribió cada texto</h2>
          <p className="nota" style={{ marginTop: 0 }}>Lo normativo (excedencias, niveles, series no evaluables) lo escribe siempre el código; el modelo solo describe concentraciones y pasa por el verificador de cifras.</p>
          <div className="lista">{Object.entries(g.redaccion).map(([s, o]) => (
            <div className="item" key={s}><strong>{SECCION[s] ?? s}</strong><span className={`etiqueta ${o === 'llm' ? 'verde' : 'gris'}`}>{ORIGEN[o] ?? o}</span></div>
          ))}</div>
        </section>
      )}

      {versiones.length > 1 && (
        <section className="tarjeta">
          <h2>Versiones guardadas de {periodo}</h2>
          <div className="tabla"><table>
            <thead><tr><th>Fecha</th><th>Datos</th><th>Comentarios</th><th className="num">Excedencias</th></tr></thead>
            <tbody>{versiones.map((v) => (
              <tr key={v.id}><td>{fechaLarga(v.generado_en)}{v.id === g.id ? ' (vigente)' : ''}</td><td>{v.archivo_datos}</td><td>{v.con_llm === null ? 'importado' : v.con_llm ? 'modelo' : 'plantilla'}</td><td className="num">{v.n_excedencias}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}

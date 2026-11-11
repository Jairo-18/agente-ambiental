'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import RevisionDatos from '@/components/RevisionDatos';
import { useConfirmar } from '@/components/useConfirmar';
import { api, ArchivoDatos, ErrorApi, esperarTrabajo, fechaLarga, num, ReporteFila, Revision } from '@/lib/api';

interface Analitica {
  totales: { reportes_guardados: number; periodos: number; evaluaciones: number; mensajes: number };
  excedencias: { estacion: string; contaminante: string; promedio: string; veces: number; maximo_ugm3: number }[];
  noEvaluables: { estacion: string; contaminante: string; periodos: number; representatividad_media: number }[];
}

/** Mes (AAAA-MM) del último dato de un archivo: la hora 00:00 del día 1 cierra el mes anterior. */
function mesDe(a?: ArchivoDatos): string {
  if (!a?.hasta) return '';
  const f = new Date(a.hasta.replace(' ', 'T'));
  f.setHours(f.getHours() - 1);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
}

export default function Inicio() {
  const router = useRouter();
  const { preguntar, dialogo } = useConfirmar();
  const [archivos, setArchivos] = useState<ArchivoDatos[]>([]);
  const [reportes, setReportes] = useState<ReporteFila[]>([]);
  const [analitica, setAnalitica] = useState<Analitica | null>(null);
  const [archivo, setArchivo] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [conLlm, setConLlm] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ clase: string; texto: string } | null>(null);
  const [revision, setRevision] = useState<Revision | null>(null);

  const cargar = useCallback(async () => {
    const [a, r, an] = await Promise.all([
      api<ArchivoDatos[]>('/api/datos').catch(() => [] as ArchivoDatos[]),
      api<ReporteFila[]>('/api/reportes').catch(() => [] as ReporteFila[]),
      api<Analitica>('/api/analitica').catch(() => null),
    ]);
    const ordenados = [...a].sort((x, y) => Number(y.archivo.endsWith('.csv')) - Number(x.archivo.endsWith('.csv')));    // CSV primero
    setArchivos(ordenados);
    setReportes(r);
    setAnalitica(an);
    setArchivo((previo) => previo || ordenados[0]?.archivo || '');
    setPeriodo((previo) => previo || mesDe(ordenados.find((x) => x.hasta)));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function revisar() {
    setOcupado('Revisando los datos…'); setMensaje(null); setRevision(null);
    try {
      setRevision(await api<Revision>('/api/reportes/revisar', { archivo, periodo }));
    } catch (e) {
      setMensaje({ clase: 'rojo', texto: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  }

  async function generar() {
    setMensaje(null); setRevision(null);
    try {
      const cuerpo = { archivo, periodo, conLlm };
      setOcupado('Preparando…');
      let r = await api<{ trabajoId?: string; requiereConfirmacion?: boolean; mensaje?: string }>('/api/reportes/generar', cuerpo);
      if (r.requiereConfirmacion) {
        setOcupado(null);
        if (!(await preguntar(r.mensaje ?? '¿Sobrescribo el reporte?'))) {
          return setMensaje({ clase: 'info', texto: 'No se tocó nada: el reporte anterior sigue como estaba.' });
        }
        setOcupado('Preparando…');
        r = await api('/api/reportes/generar', { ...cuerpo, confirmado: true });
      }
      setOcupado(conLlm ? 'Generando el reporte… el modelo está redactando, puede tardar unos minutos.' : 'Generando el reporte…');
      await esperarTrabajo(r.trabajoId!);
      router.push(`/reportes/${periodo}`);
    } catch (e) {
      setMensaje({ clase: 'rojo', texto: (e as ErrorApi).message });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <section className="tarjeta">
        <h2>Generar un reporte mensual</h2>
        <div className="fila">
          <label>
            Archivo de datos
            <select value={archivo} onChange={(e) => setArchivo(e.target.value)}>
              {archivos.map((a) => (
                <option key={a.archivo} value={a.archivo}>{a.archivo}{a.estaciones ? `  (${a.estaciones.length} estaciones)` : ''}</option>
              ))}
            </select>
          </label>
          <label>
            Mes
            <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
          </label>
        </div>
        <label className="casilla">
          <input type="checkbox" checked={conLlm} onChange={(e) => setConLlm(e.target.checked)} />
          Que el modelo redacte los comentarios (más lento; si lo desmarcas salen de plantilla)
        </label>
        <div className="acciones">
          <button className="sec" onClick={revisar} disabled={!!ocupado || !archivo || !periodo}>1 · Revisar los datos</button>
          <button className="prim" onClick={generar} disabled={!!ocupado || !archivo || !periodo}>2 · Generar el reporte</button>
        </div>
        <p className="nota">
          Revisar no escribe nada. Generar tarda de 1 a 3 minutos con los comentarios del modelo, guarda el resultado en
          PostgreSQL y pide confirmación si el mes ya tiene reporte (se conserva como versión anterior).
        </p>
        {ocupado && <div className="aviso info"><span className="carga"><span className="rueda" />{ocupado}</span></div>}
        {mensaje && <div className={`aviso ${mensaje.clase}`}>{mensaje.texto}</div>}
        {revision && <RevisionDatos r={revision} />}
      </section>

      <section className="tarjeta">
        <h2>Reportes generados</h2>
        <div className="lista">
          {reportes.length === 0 && <span className="nota">Todavía no hay reportes. Genera el primero arriba.</span>}
          {reportes.map((r) => (
            <div className="item" key={r.id}>
              <strong>{r.periodo}</strong>
              <span className={`etiqueta ${r.n_excedencias ? 'rojo' : 'verde'}`}>
                {r.n_excedencias ? `${r.n_excedencias} excedencia${r.n_excedencias > 1 ? 's' : ''}` : 'sin excedencias'}
              </span>
              <span className="etiqueta gris">{r.con_llm === null ? 'importado' : r.con_llm ? 'con modelo' : 'plantilla'}</span>
              {r.versiones > 1 && <span className="etiqueta gris">{r.versiones} versiones</span>}
              <span className="nota" style={{ margin: 0 }}>{fechaLarga(r.generado_en)}</span>
              <Link className="sec" href={`/reportes/${r.periodo}`}>Ver reporte</Link>
              <a className="sec" href={`/api/reportes/${r.periodo}/archivos/reporte.docx`}>Descargar DOCX</a>
            </div>
          ))}
        </div>
      </section>

      {analitica && analitica.totales.reportes_guardados > 0 && (
        <section className="tarjeta">
          <h2>Resumen entre reportes (consulta SQL sobre la base)</h2>
          <div className="rejilla">
            <div className="dato"><b>{analitica.totales.periodos}</b><span>periodos con reporte</span></div>
            <div className="dato"><b>{analitica.totales.reportes_guardados}</b><span>versiones guardadas</span></div>
            <div className="dato"><b>{analitica.totales.evaluaciones}</b><span>valores evaluados</span></div>
            <div className="dato"><b>{analitica.totales.mensajes}</b><span>mensajes del asistente</span></div>
          </div>
          <h3>Excedencias de los reportes vigentes</h3>
          {analitica.excedencias.length === 0 ? <p className="nota">Ninguna.</p> : (
            <div className="tabla"><table>
              <thead><tr><th>Estación</th><th>Contaminante</th><th>Promedio</th><th className="num">Veces</th><th className="num">Máximo µg/m³</th></tr></thead>
              <tbody>{analitica.excedencias.map((e, i) => (
                <tr key={i}><td>{e.estacion}</td><td>{e.contaminante}</td><td>{e.promedio}</td><td className="num">{e.veces}</td><td className="num">{num(e.maximo_ugm3)}</td></tr>
              ))}</tbody>
            </table></div>
          )}
          <h3>Series que no alcanzaron el 75 % de datos válidos</h3>
          {analitica.noEvaluables.length === 0 ? <p className="nota">Ninguna.</p> : (
            <div className="tabla"><table>
              <thead><tr><th>Estación</th><th>Contaminante</th><th className="num">Periodos</th><th className="num">Datos válidos (media)</th></tr></thead>
              <tbody>{analitica.noEvaluables.map((e, i) => (
                <tr key={i}><td>{e.estacion}</td><td>{e.contaminante}</td><td className="num">{e.periodos}</td><td className="num">{num(e.representatividad_media)} %</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      )}
      {dialogo}
    </>
  );
}

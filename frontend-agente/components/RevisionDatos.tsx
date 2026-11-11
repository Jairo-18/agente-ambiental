import { Revision, num } from '@/lib/api';

const CONTAMINANTES = ['PM10', 'PM2.5', 'SO2', 'NO2', 'O3', 'CO'];

export default function RevisionDatos({ r }: { r: Revision }) {
  const sev = r.n_advertencias_por_severidad;
  return (
    <div>
      <div className={`aviso ${sev.error ? 'rojo' : sev.aviso ? 'ambar' : 'verde'}`}>
        {sev.error} errores y {sev.aviso} avisos. Un mes completo tiene {r.horas_esperadas} horas por serie; la norma exige al menos{' '}
        {r.minimo_para_evaluar_pct} % para evaluar.
      </div>
      {r.advertencias.length > 0 && (
        <>
          <h3>Avisos del control de calidad</h3>
          <ul className="limpia">{r.advertencias.map((a, i) => <li key={i}>{a}</li>)}</ul>
          {r.advertencias_omitidas > 0 && <p className="nota">… y {r.advertencias_omitidas} más.</p>}
        </>
      )}
      <h3>Datos válidos por estación (% de horas)</h3>
      <div className="tabla">
        <table>
          <thead>
            <tr>
              <th>Estación</th>
              {CONTAMINANTES.map((c) => <th key={c} className="num">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {Object.entries(r.representatividad_pct).map(([est, v]) => (
              <tr key={est}>
                <td>{est}</td>
                {CONTAMINANTES.map((c) => (
                  <td key={c} className="num">
                    {v[c] == null ? '—' : (
                      <span className={`etiqueta ${v[c] >= r.minimo_para_evaluar_pct ? 'verde' : 'ambar'}`}>{num(v[c])}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

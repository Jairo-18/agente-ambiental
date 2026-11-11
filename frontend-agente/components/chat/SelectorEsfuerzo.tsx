'use client';

import { Esfuerzo, ESFUERZO } from '@/lib/chat';

interface Props {
  niveles: Esfuerzo[];
  valor: Esfuerzo | null;
  bloqueado: boolean;
  alCambiar: (e: Esfuerzo) => void;
}

/** Capacidad del modelo (baja → máx). Solo muestra los niveles que el modelo admite; sin niveles, no se muestra. */
export default function SelectorEsfuerzo({ niveles, valor, bloqueado, alCambiar }: Props) {
  if (!niveles.length) return null;
  return (
    <div className="cl-esfuerzo" role="radiogroup" aria-label="Capacidad">
      <span className="cl-esfuerzo-titulo" aria-hidden>Capacidad</span>
      {niveles.map((n, i) => (
        <button
          key={n} type="button" role="radio" aria-checked={valor === n} disabled={bloqueado}
          className={valor === n ? 'activo' : ''} title={ESFUERZO[n].largo} onClick={() => alCambiar(n)}
        >
          <span className="cl-barras" aria-hidden>
            {niveles.map((_, j) => <i key={j} className={j <= i ? 'llena' : ''} />)}
          </span>
          {ESFUERZO[n].corto}
        </button>
      ))}
    </div>
  );
}

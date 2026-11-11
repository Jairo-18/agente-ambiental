'use client';

import { isValidElement, memo, ReactNode, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Texto plano de los hijos de un nodo (para copiar un bloque de código). */
function textoDe(n: ReactNode): string {
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textoDe).join('');
  if (isValidElement<{ children?: ReactNode }>(n)) return textoDe(n.props.children);
  return '';
}

function BloqueCodigo({ children }: { children?: ReactNode }) {
  const [copiado, setCopiado] = useState(false);
  const codigo = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children : null;
  const lenguaje = /language-([\w+#-]+)/.exec(codigo?.props.className ?? '')?.[1] ?? 'texto';
  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoDe(codigo?.props.children ?? children).replace(/\n$/, ''));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch { /* el navegador no dejó copiar */ }
  }
  return (
    <div className="md-codigo">
      <div className="md-codigo-cab">
        <span>{lenguaje}</span>
        <button type="button" onClick={copiar}>{copiado ? '✓ Copiado' : 'Copiar'}</button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

/** Respuesta de un modelo en Markdown (tablas, listas, código). No interpreta HTML crudo: lo muestra como texto. */
function Markdown({ texto }: { texto: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noreferrer noopener" />,
          pre: ({ children }) => <BloqueCodigo>{children}</BloqueCodigo>,
          table: ({ node: _n, ...p }) => <div className="md-tabla"><table {...p} /></div>,
        }}
      >
        {texto}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);

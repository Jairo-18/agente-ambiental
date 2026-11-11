'use client';

import { useEffect, useState } from 'react';
import { api, Salud } from '@/lib/api';

/** Qué piezas están en pie (backend, base de datos, Ollama), para no quedarse adivinando en una demo. */
export default function Estado() {
  const [s, setS] = useState<Salud | null>(null);
  const [caido, setCaido] = useState(false);

  useEffect(() => {
    let vivo = true;
    const consultar = () =>
      api<Salud>('/api/salud').then(
        (d) => vivo && (setS(d), setCaido(false)),
        () => vivo && setCaido(true),
      );
    consultar();
    const t = setInterval(consultar, 15000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  if (caido) return <div className="estado"><span className="chip mal">Backend sin respuesta</span></div>;
  if (!s) return <div className="estado"><span className="chip">comprobando…</span></div>;
  return (
    <div className="estado" role="status">
      <span className="chip ok">Backend NestJS</span>
      <span className={`chip ${s.baseDeDatos.activo ? 'ok' : 'mal'}`} title={s.baseDeDatos.error}>
        PostgreSQL{s.baseDeDatos.pgvector ? ` · pgvector ${s.baseDeDatos.pgvector}` : ''}
      </span>
      <span className={`chip ${s.ollama.activo && s.ollama.chatInstalado ? 'ok' : 'mal'}`}>
        {s.ollama.activo ? `Ollama · ${s.ollama.modeloChat}` : 'Ollama apagado (ollama serve)'}
      </span>
    </div>
  );
}

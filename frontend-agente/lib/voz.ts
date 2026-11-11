'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorApi } from './api';

/** Un solo reproductor para toda la app: si empieza a hablar otra respuesta, la anterior se calla. */
let actual: { audio: HTMLAudioElement; url: string; clave: string } | null = null;
const oyentes = new Set<(clave: string | null) => void>();
const avisar = () => oyentes.forEach((f) => f(actual?.clave ?? null));

export function callar() {
  if (!actual) return;
  actual.audio.pause();
  URL.revokeObjectURL(actual.url);
  actual = null;
  avisar();
}

/** Lee un texto en voz alta con Kokoro (local, en el contenedor stt). `clave` identifica qué se está leyendo. */
export async function hablar(texto: string, clave: string, voz?: string): Promise<void> {
  callar();
  let r: Response;
  try {
    r = await fetch('/api/voz/hablar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, voz }) });
  } catch {
    throw new ErrorApi('No hay conexión con el backend.', 0);
  }
  if (!r.ok) {
    let mensaje = `Error ${r.status}`;
    try { mensaje = (await r.json())?.message ?? mensaje; } catch { /* sin JSON */ }
    throw new ErrorApi(mensaje, r.status);
  }
  const url = URL.createObjectURL(await r.blob());
  const audio = new Audio(url);
  actual = { audio, url, clave };
  audio.onended = () => { if (actual?.audio === audio) callar(); };
  avisar();
  await audio.play().catch(() => callar());
}

/** Qué se está leyendo ahora (para mostrar ■ en el botón correcto). */
export function useLeyendo(): string | null {
  const [clave, setClave] = useState<string | null>(actual?.clave ?? null);
  useEffect(() => {
    oyentes.add(setClave);
    return () => { oyentes.delete(setClave); };
  }, []);
  return clave;
}

/** Botón 🔊 / ■ para leer un texto; avisa errores con `alError`. */
export function useBotonHablar(alError?: (m: string) => void) {
  const leyendo = useLeyendo();
  const [cargando, setCargando] = useState<string | null>(null);
  const alternar = useCallback(async (texto: string, clave: string) => {
    if (leyendo === clave) { callar(); return; }
    setCargando(clave);
    try { await hablar(texto, clave); } catch (e) { alError?.((e as Error).message); } finally { setCargando(null); }
  }, [leyendo, alError]);
  return { leyendo, cargando, alternar };
}

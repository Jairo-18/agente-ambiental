'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Formatos que graba el navegador, en orden de preferencia (Whisper entiende todos). */
const FORMATOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
/** Una nota de voz no debería pasar de esto: se detiene sola. */
const MAX_SEGUNDOS = 300;

export interface Grabacion {
  blob: Blob;
  nombre: string;
  segundos: number;
}

/**
 * Graba del micrófono con MediaRecorder. `nivel` (0–1) es el volumen en vivo, para animar el botón.
 * El navegador solo deja usar el micrófono en localhost o https.
 */
export function useGrabadora() {
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [nivel, setNivel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const grabadora = useRef<MediaRecorder | null>(null);
  const pista = useRef<MediaStream | null>(null);
  const trozos = useRef<Blob[]>([]);
  const fin = useRef<((g: Grabacion | null) => void) | null>(null);
  const cancelada = useRef(false);
  const relojes = useRef<{ tiempo?: number; animacion?: number; audio?: AudioContext }>({});

  const limpiar = useCallback(() => {
    pista.current?.getTracks().forEach((t) => t.stop());
    pista.current = null;
    window.clearInterval(relojes.current.tiempo);
    cancelAnimationFrame(relojes.current.animacion ?? 0);
    relojes.current.audio?.close().catch(() => undefined);
    relojes.current = {};
    setGrabando(false);
    setNivel(0);
  }, []);

  useEffect(() => limpiar, [limpiar]);

  const empezar = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Este navegador no permite grabar audio.');
      return;
    }
    let flujo: MediaStream;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      setError((e as Error).name === 'NotAllowedError' ? 'No diste permiso para usar el micrófono.' : 'No encontré un micrófono.');
      return;
    }
    pista.current = flujo;
    const mimeType = FORMATOS.find((f) => MediaRecorder.isTypeSupported(f));
    const r = new MediaRecorder(flujo, mimeType ? { mimeType } : undefined);
    trozos.current = [];
    cancelada.current = false;
    const inicio = Date.now();
    r.ondataavailable = (e) => { if (e.data.size) trozos.current.push(e.data); };
    r.onstop = () => {
      const tipo = (r.mimeType || 'audio/webm').split(';')[0];
      const ext = tipo.includes('ogg') ? 'ogg' : tipo.includes('mp4') ? 'm4a' : 'webm';
      const seg = Math.round((Date.now() - inicio) / 1000);
      const g = cancelada.current || !trozos.current.length ? null : {
        blob: new Blob(trozos.current, { type: tipo }),
        nombre: `nota-de-voz-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${ext}`,
        segundos: seg,
      };
      limpiar();
      fin.current?.(g);
      fin.current = null;
    };
    r.start(1000);
    grabadora.current = r;
    setGrabando(true);
    setSegundos(0);
    relojes.current.tiempo = window.setInterval(() => {
      const s = Math.round((Date.now() - inicio) / 1000);
      setSegundos(s);
      if (s >= MAX_SEGUNDOS && r.state === 'recording') r.stop();
    }, 250);

    // nivel de voz en vivo (solo para la animación)
    try {
      const ctx = new AudioContext();
      const analizador = ctx.createAnalyser();
      analizador.fftSize = 512;
      ctx.createMediaStreamSource(flujo).connect(analizador);
      const datos = new Uint8Array(analizador.fftSize);
      const medir = () => {
        analizador.getByteTimeDomainData(datos);
        let suma = 0;
        for (const v of datos) suma += ((v - 128) / 128) ** 2;
        setNivel(Math.min(1, Math.sqrt(suma / datos.length) * 4));
        relojes.current.animacion = requestAnimationFrame(medir);
      };
      relojes.current.audio = ctx;
      medir();
    } catch { /* sin medidor: la grabación sigue igual */ }
  }, [limpiar]);

  /** Detiene y entrega la grabación (null si no hubo audio). */
  const detener = useCallback(
    () => new Promise<Grabacion | null>((resolver) => {
      const r = grabadora.current;
      if (!r || r.state === 'inactive') { resolver(null); return; }
      fin.current = resolver;
      r.stop();
    }),
    [],
  );

  const cancelar = useCallback(() => {
    cancelada.current = true;
    const r = grabadora.current;
    if (r && r.state !== 'inactive') r.stop();
    else limpiar();
  }, [limpiar]);

  return { grabando, segundos, nivel, error, empezar, detener, cancelar, limpiarError: () => setError(null) };
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, esperarTrabajo } from './api';
import { AdjuntoVista, EstadoVoz, quitarAdjunto, subirAdjunto, transcribirNota } from './chat';
import type { Pendiente } from './useChatLibre';
import type { Grabacion } from './useGrabadora';
import { hablar } from './voz';

export interface Llamada { herramienta: string; argumentos: unknown; error: string | null }
export interface MensajeAgente {
  rol: 'usuario' | 'agente';
  contenido: string;
  herramientas: Llamada[];
  origen: string | null;
  adjuntos?: AdjuntoVista[];
}

const CLAVE_VOZ = 'asistente:responder-por-voz';
const tipoDe = (f: File): AdjuntoVista['tipo'] => (f.type.startsWith('image/') ? 'imagen' : f.type.startsWith('audio/') ? 'audio' : 'documento');

/**
 * El agente ambiental: reportes ciudadanos (texto o voz, con evidencias) y reporte mensual del aire. Cada turno corre
 * en segundo plano; mientras tanto se consulta si el agente pide confirmación (registrar o sobrescribir).
 */
export function useAsistente(preguntar: (pregunta: string) => Promise<boolean>) {
  const [mensajes, setMensajes] = useState<MensajeAgente[]>([]);
  const [esperando, setEsperando] = useState(false);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [voz, setVoz] = useState<EstadoVoz | null>(null);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [porVoz, setPorVozEstado] = useState(false);
  const dictado = useRef(false); // el mensaje actual se dictó con el micrófono
  const preguntando = useRef(false);

  useEffect(() => {
    try { setPorVozEstado(localStorage.getItem(CLAVE_VOZ) === '1'); } catch { /* sin almacenamiento */ }
    api<{ mensajes: MensajeAgente[] }>('/api/asistente/historial').then((h) => setMensajes(h.mensajes), () => undefined);
    api<{ stt: EstadoVoz }>('/api/voz').then((v) => setVoz(v.stt), () => setVoz({ disponible: false, modelo: '', nota: 'El servicio de voz no responde.' }));
  }, []);

  const setPorVoz = (v: boolean) => {
    setPorVozEstado(v);
    try { localStorage.setItem(CLAVE_VOZ, v ? '1' : '0'); } catch { /* sin almacenamiento */ }
  };

  const leer = useCallback((texto: string, clave: string) => {
    if (porVoz) hablar(texto, clave).catch((e: Error) => setAviso(e.message));
  }, [porVoz]);

  /** Mientras el agente trabaja, la confirmación le llega al navegador por esta consulta. */
  async function vigilarConfirmacion() {
    if (preguntando.current) return;
    const { pendiente } = await api<{ pendiente: { id: string; pregunta: string } | null }>('/api/asistente/pendiente');
    if (!pendiente) return;
    preguntando.current = true;
    leer(pendiente.pregunta, `confirmacion-${pendiente.id}`);
    const ok = await preguntar(pendiente.pregunta);
    await api('/api/asistente/confirmar', { id: pendiente.id, ok });
    preguntando.current = false;
  }

  const cambiar = (clave: string, cambio: Partial<Pendiente>) => setPendientes((ps) => ps.map((p) => (p.clave === clave ? { ...p, ...cambio } : p)));

  function adjuntar(archivos: File[]) {
    for (const f of archivos) {
      const clave = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const tipo = tipoDe(f);
      setPendientes((ps) => [...ps, { clave, nombre: f.name, tipo, tamano: f.size, estado: 'subiendo', vistaPrevia: tipo === 'imagen' ? URL.createObjectURL(f) : undefined }]);
      subirAdjunto(f).then(
        (adjunto) => cambiar(clave, adjunto.estado === 'error' ? { estado: 'error', adjunto, error: adjunto.error ?? 'No se pudo leer' } : { estado: 'listo', adjunto }),
        (e: Error) => cambiar(clave, { estado: 'error', error: e.message }),
      );
    }
  }

  function quitar(clave: string) {
    setPendientes((ps) => {
      const p = ps.find((x) => x.clave === clave);
      if (p?.adjunto) quitarAdjunto(p.adjunto.id);
      if (p?.vistaPrevia) URL.revokeObjectURL(p.vistaPrevia);
      return ps.filter((x) => x.clave !== clave);
    });
  }

  /** Nota de voz: Whisper local la transcribe; el audio queda como evidencia del reporte y el texto va a la caja. */
  async function dictar(g: Grabacion): Promise<string | null> {
    setTranscribiendo(true);
    setAviso(null);
    try {
      const { texto, adjunto } = await transcribirNota(g.blob, g.nombre);
      setPendientes((ps) => [...ps, { clave: adjunto.id, nombre: `Nota de voz (${g.segundos} s)`, tipo: 'audio', tamano: adjunto.tamano, estado: 'listo', adjunto }]);
      dictado.current = true;
      if (!texto) setAviso('No se entendió nada en la grabación. ¿El micrófono está bien?');
      return texto || null;
    } catch (e) {
      setAviso((e as Error).message);
      return null;
    } finally {
      setTranscribiendo(false);
    }
  }

  const subiendo = pendientes.some((p) => p.estado === 'subiendo');

  async function enviar(texto: string): Promise<boolean> {
    const listos = pendientes.filter((p) => p.estado === 'listo' && p.adjunto);
    const t = texto.trim() || (listos.length ? 'Te envío evidencias del problema.' : '');
    if (!t || esperando || subiendo) return false;
    const adjuntos = listos.map((p) => p.adjunto!);
    const canal = dictado.current ? 'voz' : 'texto';
    setEsperando(true);
    setAviso(null);
    setPendientes([]);
    dictado.current = false;
    setMensajes((m) => [...m, { rol: 'usuario', contenido: t, herramientas: [], origen: null, adjuntos }]);
    try {
      const { trabajoId } = await api<{ trabajoId: string }>('/api/asistente/mensajes', { mensaje: t, adjuntoIds: adjuntos.map((a) => a.id), canal });
      const r = await esperarTrabajo<{ respuesta: string; origen: string; llamadas: Llamada[] }>(trabajoId, vigilarConfirmacion);
      setMensajes((m) => [...m, { rol: 'agente', contenido: r.respuesta, herramientas: r.llamadas, origen: r.origen }]);
      leer(r.respuesta, `respuesta-${Date.now()}`);
      return true;
    } catch (err) {
      setMensajes((m) => [...m, { rol: 'agente', contenido: (err as Error).message, herramientas: [], origen: 'error' }]);
      return false;
    } finally {
      setEsperando(false);
    }
  }

  async function nueva() {
    try {
      await api('/api/asistente/nueva', {});
      setMensajes([]);
      setPendientes([]);
    } catch (e) {
      setAviso((e as Error).message);
    }
  }

  return {
    mensajes, esperando, pendientes, voz, transcribiendo, aviso, porVoz, subiendo,
    setAviso, setPorVoz, adjuntar, quitar, dictar, enviar, nueva,
    // para BotonVoz
    generando: esperando,
  };
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import {
  AdjuntoVista, borrarConversacion, ConversacionCompleta, ConversacionFila, Esfuerzo, enviarMensaje, EstadoProveedor, EstadoVoz, MensajeChat,
  ModeloInfo, ProveedorId, quitarAdjunto, subirAdjunto, transcribirNota,
} from './chat';
import type { Grabacion } from './useGrabadora';

/** Un archivo elegido para el próximo mensaje: se sube en cuanto se elige y se envía con el mensaje. */
export interface Pendiente {
  clave: string;
  nombre: string;
  tipo: AdjuntoVista['tipo'];
  tamano: number;
  /** URL local para ver la miniatura de una imagen antes de enviarla. */
  vistaPrevia?: string;
  estado: 'subiendo' | 'listo' | 'error';
  adjunto?: AdjuntoVista;
  error?: string;
}

const tipoDe = (f: File): AdjuntoVista['tipo'] => (f.type.startsWith('image/') ? 'imagen' : f.type.startsWith('audio/') ? 'audio' : 'documento');

/** Lo que se recuerda en este navegador: último proveedor, último modelo de cada uno y el esfuerzo elegido para cada modelo. */
interface Preferencia {
  proveedor?: ProveedorId;
  modelos?: Partial<Record<ProveedorId, string>>;
  esfuerzos?: Record<string, Esfuerzo>;
}
const CLAVE = 'chat-libre:preferencia:v2';
function leer(): Preferencia {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Preferencia; } catch { return {}; }
}
function guardar(cambio: (p: Preferencia) => Preferencia) {
  try { localStorage.setItem(CLAVE, JSON.stringify(cambio(leer()))); } catch { /* sin almacenamiento: no pasa nada */ }
}

export interface Seleccion {
  proveedor: ProveedorId;
  modelo: string;
  esfuerzo: Esfuerzo | null;
}

/** Esfuerzo válido para un modelo: el recordado si lo admite; si no, su valor por defecto. */
function esfuerzoPara(m: ModeloInfo | undefined): Esfuerzo | null {
  if (!m?.esfuerzos.length) return null;
  const recordado = leer().esfuerzos?.[m.id];
  return recordado && m.esfuerzos.includes(recordado) ? recordado : (m.esfuerzoPorDefecto ?? m.esfuerzos[0]);
}

export function useChatLibre() {
  const [proveedores, setProveedores] = useState<EstadoProveedor[] | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion>({ proveedor: 'ollama', modelo: '', esfuerzo: null });
  const [conversaciones, setConversaciones] = useState<ConversacionFila[]>([]);
  const [actual, setActual] = useState<{ id?: string; titulo: string }>({ titulo: 'Chat nuevo' });
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const control = useRef<AbortController | null>(null);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [voz, setVoz] = useState<EstadoVoz | null>(null);
  const [transcribiendo, setTranscribiendo] = useState(false);

  const estado = proveedores?.find((p) => p.id === seleccion.proveedor);
  const modeloInfo = estado?.modelos.find((m) => m.id === seleccion.modelo);

  /** Selecciona proveedor y modelo (el pedido, el recordado o el de por defecto) con su esfuerzo. */
  const seleccionar = useCallback((lista: EstadoProveedor[], proveedor: ProveedorId, modelo?: string, recordar = true) => {
    const p = lista.find((x) => x.id === proveedor);
    const candidatos = [modelo, leer().modelos?.[proveedor], p?.modeloPorDefecto ?? undefined];
    const elegido = candidatos.map((c) => p?.modelos.find((m) => m.id === c)).find(Boolean) ?? p?.modelos[0];
    setSeleccion({ proveedor, modelo: elegido?.id ?? '', esfuerzo: esfuerzoPara(elegido) });
    if (recordar && elegido) guardar((pr) => ({ ...pr, proveedor, modelos: { ...pr.modelos, [proveedor]: elegido.id } }));
  }, []);

  const cargarProveedores = useCallback(async (primeraVez = false) => {
    try {
      const lista = await api<EstadoProveedor[]>('/api/chat/proveedores');
      setProveedores(lista);
      if (primeraVez) {
        const pref = leer().proveedor;
        const inicial = lista.find((p) => p.id === pref && p.disponible) ?? lista.find((p) => p.disponible) ?? lista[0];
        if (inicial) seleccionar(lista, inicial.id, undefined, false);
      }
    } catch (e) {
      setAviso((e as Error).message);
    }
  }, [seleccionar]);

  const cargarConversaciones = useCallback(() => {
    api<ConversacionFila[]>('/api/chat/conversaciones').then(setConversaciones, () => undefined);
  }, []);

  useEffect(() => { cargarProveedores(true); cargarConversaciones(); }, [cargarProveedores, cargarConversaciones]);

  // estado de la voz; mientras se descarga el modelo de Whisper, se vuelve a preguntar
  useEffect(() => {
    let vivo = true;
    let reloj: number | undefined;
    const consultar = () => api<EstadoVoz>('/api/chat/voz').then(
      (v) => { if (!vivo) return; setVoz(v); if (!v.disponible) reloj = window.setTimeout(consultar, 15000); },
      () => { if (vivo) setVoz({ disponible: false, modelo: '', nota: 'El servicio de voz no responde.' }); },
    );
    consultar();
    return () => { vivo = false; window.clearTimeout(reloj); };
  }, []);

  const cambiarPendiente = (clave: string, cambio: Partial<Pendiente>) =>
    setPendientes((ps) => ps.map((p) => (p.clave === clave ? { ...p, ...cambio } : p)));

  /** Sube cada archivo en cuanto se elige (en paralelo); el backend lo guarda, lo lee y lo indexa. */
  function adjuntar(archivos: File[]) {
    for (const f of archivos) {
      const clave = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const tipo = tipoDe(f);
      setPendientes((ps) => [...ps, { clave, nombre: f.name, tipo, tamano: f.size, estado: 'subiendo', vistaPrevia: tipo === 'imagen' ? URL.createObjectURL(f) : undefined }]);
      subirAdjunto(f).then(
        (adjunto) => cambiarPendiente(clave, adjunto.estado === 'error' ? { estado: 'error', adjunto, error: adjunto.error ?? 'No se pudo leer' } : { estado: 'listo', adjunto }),
        (e: Error) => cambiarPendiente(clave, { estado: 'error', error: e.message }),
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

  /** Transcribe una nota de voz con Whisper local; el audio queda adjunto al mensaje y su texto vuelve a la caja. */
  async function dictar(g: Grabacion): Promise<string | null> {
    setTranscribiendo(true);
    setAviso(null);
    try {
      const { texto, adjunto } = await transcribirNota(g.blob, g.nombre);
      setPendientes((ps) => [...ps, { clave: adjunto.id, nombre: `Nota de voz (${g.segundos} s)`, tipo: 'audio', tamano: adjunto.tamano, estado: 'listo', adjunto }]);
      if (!texto) setAviso('No se entendió nada en la grabación. ¿El micrófono está bien?');
      return texto || null;
    } catch (e) {
      setAviso((e as Error).message);
      return null;
    } finally {
      setTranscribiendo(false);
    }
  }

  /** Qué impide enviar con los adjuntos actuales y el modelo elegido (null = nada). */
  const imagenesPendientes = pendientes.some((p) => p.tipo === 'imagen');
  const bloqueoAdjuntos =
    pendientes.some((p) => p.estado === 'subiendo') ? 'Esperando a que terminen de subir los archivos…'
    : imagenesPendientes && modeloInfo && !modeloInfo.entradas.includes('imagen') ? `${modeloInfo.nombre} no ve imágenes: elige un Claude, DeepSeek V4.1 Flash o qwen2.5vl en Ollama.`
    : pendientes.some((p) => p.estado === 'error') ? 'Quita los archivos con error para poder enviar.'
    : null;

  function elegirModelo(proveedor: ProveedorId, modelo: string) {
    if (generando || !proveedores) return;
    seleccionar(proveedores, proveedor, modelo);
  }

  function elegirEsfuerzo(esfuerzo: Esfuerzo) {
    setSeleccion((s) => ({ ...s, esfuerzo }));
    guardar((p) => ({ ...p, esfuerzos: { ...p.esfuerzos, [seleccion.modelo]: esfuerzo } }));
  }

  async function abrir(id: string) {
    if (generando) return;
    setAviso(null);
    try {
      const c = await api<ConversacionCompleta>(`/api/chat/conversaciones/${id}`);
      setActual({ id: c.id, titulo: c.titulo });
      setMensajes(c.mensajes);
      if (proveedores) seleccionar(proveedores, c.proveedor, c.modelo, false);
    } catch (e) {
      setAviso((e as Error).message);
    }
  }

  function nuevo() {
    if (generando) return;
    setActual({ titulo: 'Chat nuevo' });
    setMensajes([]);
    setAviso(null);
  }

  async function borrar(c: ConversacionFila) {
    if (generando) return;
    try {
      await borrarConversacion(c.id);
      if (actual.id === c.id) nuevo();
      cargarConversaciones();
    } catch (e) {
      setAviso((e as Error).message);
    }
  }

  /** Cambia el último mensaje (la respuesta que se está escribiendo). */
  const actualizarUltimo = (f: (m: MensajeChat) => MensajeChat) =>
    setMensajes((ms) => (ms.length ? [...ms.slice(0, -1), f(ms[ms.length - 1])] : ms));

  /** Devuelve false si el backend rechazó el mensaje antes de empezar (para devolver el texto a la caja). */
  async function enviar(texto: string, instrucciones?: string): Promise<boolean> {
    const listos = pendientes.filter((p) => p.estado === 'listo' && p.adjunto);
    const t = texto.trim() || (listos.length ? 'Revisa los archivos adjuntos.' : '');
    if (!t || generando || !estado?.disponible || !seleccion.modelo || bloqueoAdjuntos) return false;
    setAviso(null);
    setGenerando(true);
    const { proveedor, modelo, esfuerzo } = seleccion;
    const base = { proveedor, modelo, esfuerzo, razonamiento: null, duracion_ms: null, error: null };
    const adjuntos = listos.map((p) => p.adjunto!);
    setMensajes((ms) => [...ms, { ...base, rol: 'usuario', contenido: t, adjuntos }, { ...base, rol: 'asistente', contenido: '' }]);

    const c = new AbortController();
    control.current = c;
    try {
      await enviarMensaje(
        { conversacionId: actual.id, proveedor, modelo, esfuerzo: esfuerzo ?? undefined, mensaje: t, instrucciones: instrucciones?.trim() || undefined, adjuntoIds: adjuntos.map((a) => a.id) },
        (ev) => {
          if (ev.tipo === 'inicio') { setActual({ id: ev.conversacionId, titulo: ev.titulo }); actualizarUltimo((m) => ({ ...m, esfuerzo: ev.esfuerzo, contexto: ev.contexto })); setPendientes([]); }
          else if (ev.tipo === 'texto') actualizarUltimo((m) => ({ ...m, contenido: m.contenido + ev.texto }));
          else if (ev.tipo === 'razonamiento') actualizarUltimo((m) => ({ ...m, razonamiento: (m.razonamiento ?? '') + ev.texto }));
          else if (ev.tipo === 'error') actualizarUltimo((m) => ({ ...m, error: ev.mensaje }));
          else if (ev.tipo === 'fin') actualizarUltimo((m) => ({ ...m, id: ev.mensajeId, duracion_ms: ev.duracionMs }));
        },
        c.signal,
      );
      if (c.signal.aborted) actualizarUltimo((m) => ({ ...m, error: m.error ?? 'Detenido por el usuario.' }));
      return true;
    } catch (err) {
      setMensajes((ms) => ms.slice(0, -2));
      setAviso((err as Error).message);
      cargarProveedores();
      return false;
    } finally {
      control.current = null;
      setGenerando(false);
      cargarConversaciones();
    }
  }

  return {
    proveedores, estado, modeloInfo, seleccion, conversaciones, actual, mensajes, generando, aviso,
    pendientes, voz, transcribiendo, bloqueoAdjuntos,
    setAviso, elegirModelo, elegirEsfuerzo, abrir, nuevo, borrar, enviar, adjuntar, quitar, dictar,
    detener: () => control.current?.abort(),
    recargarProveedores: () => cargarProveedores(),
  };
}

export type ChatLibre = ReturnType<typeof useChatLibre>;

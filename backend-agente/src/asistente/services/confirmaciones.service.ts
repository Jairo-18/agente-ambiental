import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ESPERA_CONFIRMACION_MS } from '../constants/asistente.constants';

interface Pendiente {
  id: string;
  pregunta: string;
  resolver: (ok: boolean) => void;
  temporizador: NodeJS.Timeout;
}

/**
 * Confirmaciones humanas que el agente necesita (sobrescribir un reporte). El agente espera la respuesta; la interfaz
 * consulta `pendiente()` mientras tanto y contesta con `responder()`. Sin respuesta a tiempo cuenta como un "no".
 */
@Injectable()
export class ConfirmacionesService {
  private actual: Pendiente | null = null;

  preguntar(pregunta: string, esperaMs = ESPERA_CONFIRMACION_MS): Promise<boolean> {
    this.actual?.resolver(false); // solo hay un agente: una pregunta nueva deja sin efecto la anterior
    return new Promise<boolean>((resolve) => {
      const p: Pendiente = {
        id: randomUUID(), pregunta,
        resolver: (ok) => {
          clearTimeout(p.temporizador);
          if (this.actual === p) this.actual = null;
          resolve(ok);
        },
        temporizador: setTimeout(() => p.resolver(false), esperaMs),
      };
      this.actual = p;
    });
  }

  pendiente(): { id: string; pregunta: string } | null {
    return this.actual ? { id: this.actual.id, pregunta: this.actual.pregunta } : null;
  }

  responder(id: string, ok: boolean): { ok: true } {
    if (!this.actual || this.actual.id !== id) throw new NotFoundException('Esa confirmación ya no está pendiente.');
    this.actual.resolver(ok);
    return { ok: true };
  }
}

import { HttpException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export interface Trabajo {
  id: string;
  tipo: string;
  estado: 'en_curso' | 'listo' | 'error';
  iniciado: string;
  terminado?: string;
  resultado?: unknown;
  error?: { estado: number; mensaje: string };
}

/**
 * Operaciones largas (generar un reporte, chatear con el modelo) corren en segundo plano: el POST responde de inmediato
 * con un id y el navegador consulta el estado. Así ningún proxy ni navegador corta una petición de varios minutos.
 * Una sola operación pesada a la vez (el modelo local no rinde con dos a la vez).
 */
@Injectable()
export class TrabajosService {
  private readonly trabajos = new Map<string, Trabajo>();
  private readonly maximoGuardados = 100;

  /** El trabajo en curso, si lo hay. */
  enCurso(): Trabajo | undefined {
    return [...this.trabajos.values()].find((t) => t.estado === 'en_curso');
  }

  lanzar(tipo: string, fn: () => Promise<unknown>): Trabajo {
    const activo = this.enCurso();
    if (activo) throw new HttpException(`Hay otra operación en curso (${activo.tipo}). Espera a que termine.`, 409);
    const t: Trabajo = { id: randomUUID(), tipo, estado: 'en_curso', iniciado: new Date().toISOString() };
    this.trabajos.set(t.id, t);
    if (this.trabajos.size > this.maximoGuardados) this.trabajos.delete(this.trabajos.keys().next().value as string);
    fn().then(
      (resultado) => Object.assign(t, { estado: 'listo', resultado, terminado: new Date().toISOString() }),
      (e: { getStatus?: () => number; message?: string }) =>
        Object.assign(t, {
          estado: 'error',
          error: { estado: e?.getStatus?.() ?? 500, mensaje: e?.message ?? 'Error inesperado' },
          terminado: new Date().toISOString(),
        }),
    );
    return t;
  }

  obtener(id: string): Trabajo {
    const t = this.trabajos.get(id);
    if (!t) throw new HttpException('No existe ese trabajo.', 404);
    return t;
  }
}

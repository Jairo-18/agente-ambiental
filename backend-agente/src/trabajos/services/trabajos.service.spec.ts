import { HttpException } from '@nestjs/common';
import { TrabajosService } from './trabajos.service';

const esperar = () => new Promise((r) => setImmediate(r));

describe('TrabajosService', () => {
  it('un trabajo queda en curso y luego listo con su resultado', async () => {
    const s = new TrabajosService();
    let terminar!: (v: unknown) => void;
    const t = s.lanzar('x', () => new Promise((r) => (terminar = r)));
    expect(s.obtener(t.id).estado).toBe('en_curso');
    terminar({ ok: 1 });
    await esperar();
    expect(s.obtener(t.id)).toMatchObject({ estado: 'listo', resultado: { ok: 1 } });
  });

  it('un fallo queda registrado con su código HTTP', async () => {
    const s = new TrabajosService();
    const t = s.lanzar('x', async () => {
      throw new HttpException('Ollama caído', 503);
    });
    await esperar();
    expect(s.obtener(t.id)).toMatchObject({ estado: 'error', error: { estado: 503, mensaje: 'Ollama caído' } });
  });

  it('un error inesperado (sin código) es un 500', async () => {
    const s = new TrabajosService();
    const t = s.lanzar('x', async () => {
      throw new Error('boom');
    });
    await esperar();
    expect(s.obtener(t.id).error).toEqual({ estado: 500, mensaje: 'boom' });
  });

  it('solo una operación a la vez, y se libera al terminar', async () => {
    const s = new TrabajosService();
    let terminar!: () => void;
    s.lanzar('generar_reporte', () => new Promise<void>((r) => (terminar = r)));
    expect(() => s.lanzar('chat', async () => 1)).toThrow(/otra operación en curso \(generar_reporte\)/);
    terminar();
    await esperar();
    expect(() => s.lanzar('chat', async () => 1)).not.toThrow();
  });

  it('un trabajo desconocido es 404', () => {
    expect(() => new TrabajosService().obtener('no-existe')).toThrow(/No existe/);
  });

  it('solo guarda los últimos 100 trabajos', async () => {
    const s = new TrabajosService();
    const ids: string[] = [];
    for (let i = 0; i < 105; i++) {
      ids.push(s.lanzar('x', async () => i).id);
      await esperar();
    }
    expect(() => s.obtener(ids[0])).toThrow();
    expect(s.obtener(ids[104]).estado).toBe('listo');
  });
});

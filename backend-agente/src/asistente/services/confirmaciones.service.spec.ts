import { ConfirmacionesService } from './confirmaciones.service';

describe('ConfirmacionesService', () => {
  it('la pregunta queda pendiente hasta que alguien responde, y la respuesta llega a quien esperaba', async () => {
    const s = new ConfirmacionesService();
    const espera = s.preguntar('¿Sobrescribo?');
    const p = s.pendiente()!;
    expect(p.pregunta).toBe('¿Sobrescribo?');
    expect(s.responder(p.id, true)).toEqual({ ok: true });
    await expect(espera).resolves.toBe(true);
    expect(s.pendiente()).toBeNull();
  });

  it('un "no" es un no', async () => {
    const s = new ConfirmacionesService();
    const espera = s.preguntar('¿Sobrescribo?');
    s.responder(s.pendiente()!.id, false);
    await expect(espera).resolves.toBe(false);
  });

  it('sin respuesta a tiempo cuenta como un no (nunca se sobrescribe por omisión)', async () => {
    const s = new ConfirmacionesService();
    await expect(s.preguntar('¿Sobrescribo?', 20)).resolves.toBe(false);
    expect(s.pendiente()).toBeNull();
  });

  it('un id equivocado o una confirmación ya resuelta no valen', async () => {
    const s = new ConfirmacionesService();
    const espera = s.preguntar('¿Sobrescribo?');
    expect(() => s.responder('otro-id', true)).toThrow(/ya no está pendiente/);
    const { id } = s.pendiente()!;
    s.responder(id, true);
    await espera;
    expect(() => s.responder(id, true)).toThrow(/ya no está pendiente/);
  });

  it('una pregunta nueva deja sin efecto la anterior (como un no)', async () => {
    const s = new ConfirmacionesService();
    const primera = s.preguntar('primera');
    const segunda = s.preguntar('segunda');
    await expect(primera).resolves.toBe(false);
    expect(s.pendiente()!.pregunta).toBe('segunda');
    s.responder(s.pendiente()!.id, true);
    await expect(segunda).resolves.toBe(true);
  });
});

import { crearAgente, llamada } from '../../../test/helpers/dobles';
import { paraVoz } from '../../llm/services/voz.service';
import { direccionDicha } from './agente.service';
import { ConfirmacionesService } from './confirmaciones.service';

const QUEMA = {
  tipo: 'quema', descripcion: 'están quemando basura en el lote de la esquina, hay llamas', direccion: 'calle 38 sur con carrera 80, Kennedy', en_curso: true,
};

/** Responde la confirmación en cuanto el agente la pide (como lo haría la persona en la pantalla). */
async function contestar(c: ConfirmacionesService, ok: boolean): Promise<string> {
  for (let i = 0; i < 200; i++) {
    const p = c.pendiente();
    if (p) {
      c.responder(p.id, ok);
      return p.pregunta;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('el agente no pidió confirmación');
}

describe('Agente: reportes ciudadanos', () => {
  it('registra tras la confirmación y la respuesta la escribe el código (radicado real, emergencia primero, canales oficiales)', async () => {
    const { agente, ollama, confirmaciones, ciudadanos } = crearAgente();
    ollama.encolar(llamada('registrar_reporte_ciudadano', QUEMA), 'ESTO NO DEBE LLEGAR AL USUARIO');
    const turno = agente.responder('están quemando basura aquí en la calle 38 sur con 80 en Kennedy, hay llamas');
    const pregunta = await contestar(confirmaciones, true);
    const t = await turno;

    expect(pregunta).toContain('Quema o incendio · prioridad alta · EMERGENCIA');
    expect(pregunta).toContain('(Kennedy)');
    expect(t.origen).toBe('plantilla');
    expect(ollama.respuestas).toEqual(['ESTO NO DEBE LLEGAR AL USUARIO']);
    expect(t.respuesta.startsWith('Primero lo urgente: si el peligro sigue, llama ya a la línea 123.')).toBe(true);
    expect(t.respuesta).toContain('radicado RA-2026-00001. Prioridad alta.');
    expect(t.respuesta).toContain('no es oficial');
    expect(ciudadanos.guardados).toHaveLength(1);
  });

  it('si la persona no confirma, no se guarda nada', async () => {
    const { agente, ollama, confirmaciones, ciudadanos } = crearAgente();
    ollama.encolar(llamada('registrar_reporte_ciudadano', QUEMA));
    const turno = agente.responder('reporto una quema en la calle 38 sur con carrera 80, Kennedy');
    await contestar(confirmaciones, false);
    const t = await turno;
    expect(t.respuesta).toContain('No registré el reporte');
    expect(ciudadanos.guardados).toHaveLength(0);
  });

  it('si falta la dirección, la herramienta lo devuelve como error y el modelo pregunta (sin confirmación)', async () => {
    const { agente, ollama, confirmaciones } = crearAgente();
    ollama.encolar(llamada('registrar_reporte_ciudadano', { ...QUEMA, direccion: '' }), '¿En qué dirección o cerca de qué lugar está pasando?');
    const t = await agente.responder('están quemando basura');
    expect(confirmaciones.pendiente()).toBeNull();
    expect(t.llamadas[0].resultado.error).toContain('Falta la dirección');
    expect(t).toMatchObject({ origen: 'llm', respuesta: '¿En qué dirección o cerca de qué lugar está pasando?' });
  });

  it('rechaza un radicado inventado y que diga "quedó registrado" sin llamar a la herramienta', async () => {
    const { agente, ollama } = crearAgente();
    ollama.encolar('Listo, tu reporte quedó registrado con el radicado RA-2026-00077.', 'Tu reporte quedó registrado.', 'Necesito la dirección para registrarlo.');
    const t = await agente.responder('hay basura en mi cuadra');
    expect(t.problemas[0]).toContain('radicados que ninguna herramienta devolvió: RA-2026-00077');
    expect(t.problemas[1]).toContain('no llamaste a registrar_reporte_ciudadano');
    expect(t.respuesta).toBe('Necesito la dirección para registrarlo.');
  });

  it('consultar un radicado existente habilita hablar de él', async () => {
    const { agente, ollama, confirmaciones } = crearAgente();
    ollama.encolar(llamada('registrar_reporte_ciudadano', QUEMA));
    const turno = agente.responder('quema en la calle 38 sur con carrera 80 en Kennedy');
    await contestar(confirmaciones, true);
    await turno;
    ollama.encolar(llamada('consultar_reporte_ciudadano', { radicado: 'RA-2026-00001' }), 'Tu reporte RA-2026-00001 está registrado y en estado recibido.');
    const t = await agente.responder('¿cómo va mi reporte RA-2026-00001?');
    expect(t).toMatchObject({ origen: 'llm', problemas: [] });
    expect(t.llamadas[0].resultado).toMatchObject({ radicado: 'RA-2026-00001', estado: 'recibido' });
  });
});

describe('paraVoz', () => {
  it('quita Markdown, citas y enlaces; unidades y teléfonos en palabras o dígitos', () => {
    const t = paraVoz('**Límite**: 37 µg/m³ [LIM-PM25-24H]. Ruido 55 dB(A). Llama al 3778899 o mira https://x.gov.co\n\n- PM2.5 alto');
    expect(t).toBe('Límite: 37 microgramos por metro cúbico. Ruido 55 decibeles. Llama al 3 7 7 8 8 9 9 o mira el enlace que aparece en pantalla. PM dos punto cinco alto');
  });

  it('corta textos largos con aviso', () => {
    const t = paraVoz('palabra '.repeat(400), 100);
    expect(t.length).toBeLessThan(140);
    expect(t).toContain('El resto está en la pantalla.');
  });
});

describe('Agente: las reglas leen las palabras del ciudadano, no solo el resumen del modelo (regresión R4)', () => {
  it('"frente al colegio" cuenta aunque el modelo lo omita en la descripción y la dirección', async () => {
    const { agente, ollama, confirmaciones, ciudadanos } = crearAgente();
    ollama.encolar(llamada('registrar_reporte_ciudadano', { tipo: 'residuos', descripcion: 'botadero de basura y llantas', direccion: 'calle 56 sur con carrera 19, Tunjuelito' }));
    const turno = agente.responder('Frente al colegio de la calle 56 sur con carrera 19 en Tunjuelito hay un botadero de basura y llantas.');
    await contestar(confirmaciones, true);
    await turno;
    expect(ciudadanos.guardados[0]).toMatchObject({ prioridad: 'media', puntaje: 2 });
  });
});

describe('direccionDicha (guarda: el lugar lo dice el ciudadano)', () => {
  it('acepta la dirección que dijo, aunque el modelo la reescriba; rechaza una inventada o solo genérica', () => {
    const dijo = ['están quemando basura', 'es en la calle 38 sur con carrera 80 en Kennedy'];
    expect(direccionDicha('Calle 38 Sur # 80, Kennedy', dijo)).toBe(true);
    expect(direccionDicha('Carrera 7 con calle 120, Usaquén', dijo)).toBe(false);
    expect(direccionDicha('Bogotá', dijo)).toBe(false);
  });
});

describe('Agente: la dirección no se supone', () => {
  it('si el modelo pone una dirección que el ciudadano no dijo, no se pide confirmación y debe preguntar', async () => {
    const { agente, ollama, confirmaciones } = crearAgente();
    ollama.encolar(llamada('registrar_reporte_ciudadano', { ...QUEMA, direccion: 'carrera 7 con calle 120' }), '¿Dónde está pasando?');
    const t = await agente.responder('están quemando basura, hay llamas');
    expect(confirmaciones.pendiente()).toBeNull();
    expect(t.llamadas[0].resultado.error).toContain('no la dijo el ciudadano');
    expect(t.respuesta).toBe('¿Dónde está pasando?');
  });
});

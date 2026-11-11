import { crearConfig, crearNorma } from '../../../test/helpers/servicios';
import { OllamaFalso } from '../../../test/helpers/dobles';
import { Hallazgo } from '../../shared/repositories/normaFragmento.repository';
import { NormaService, SIN_RESPUESTA } from './norma.service';

const LIM: Hallazgo = {
  clave: 'LIM-PM10-24H', tipo: 'limite', titulo: 'Límite PM10 de 24 horas', verificado: true, similitud: 0.82,
  texto: 'El nivel máximo permisible de PM10 para un promedio de 24 horas es 75 µg/m³ a condiciones de referencia.',
  fuente: 'Res. 2254/2017, Art. 2, Tabla 1',
};
const SUPUESTO: Hallazgo = {
  clave: 'SUPUESTO-VALIDEZ-PROMEDIOS', tipo: 'supuesto', titulo: 'Validez de promedios', verificado: false, similitud: 0.7,
  texto: 'Supuesto del proyecto: un promedio de 24 horas es válido con al menos 18 horas.', fuente: 'proyecto',
};

/** El servicio con la base, el índice y Ollama sustituidos: aquí solo se prueba recuperar, redactar y verificar. */
function crear(respuestas: string[], encontrados: Hallazgo[] = [LIM], fragmentosEnIndice = 39) {
  const ollama = new OllamaFalso().encolar(...respuestas);
  const consultas = { create: (x: unknown) => x, save: jest.fn(async (x: unknown) => x) };
  const repo = { estado: jest.fn(async () => ({ fragmentos: fragmentosEnIndice, ultimaIndexacion: null })) };
  const s = new NormaService(crearConfig() as never, crearNorma().fragmentos, ollama as never, repo as never, consultas as never);
  jest.spyOn(s, 'buscar').mockResolvedValue(encontrados);
  return { s, ollama, consultas, repo };
}

describe('NormaService.preguntar', () => {
  it('responde con el modelo cuando cita bien y las cifras son de los fragmentos', async () => {
    const { s, ollama, consultas } = crear(['El límite de PM10 en 24 horas es 75 µg/m³ [LIM-PM10-24H].']);
    const r = await s.preguntar('¿Cuál es el límite de PM10?');
    expect(r).toMatchObject({ origen: 'llm', intentos: 1, problemas: [] });
    expect(r.citas.map((c) => c.clave)).toEqual(['LIM-PM10-24H']);
    expect(ollama.vistos).toHaveLength(1);
    expect(consultas.save).toHaveBeenCalledTimes(1); // queda registrada la consulta
  });

  it('el modelo ve los fragmentos con su clave, su fuente y si son supuestos', async () => {
    const { s, ollama } = crear(['x [LIM-PM10-24H] 75'], [LIM, SUPUESTO]);
    await s.preguntar('¿Cuál es el límite de PM10?');
    const usuario = ollama.vistos[0][1].content;
    expect(usuario).toContain('[LIM-PM10-24H] Límite PM10 de 24 horas (Res. 2254/2017, Art. 2, Tabla 1; texto de la norma)');
    expect(usuario).toContain('supuesto del proyecto');
  });

  it('una cifra inventada se rechaza, se le dice al modelo y se acepta la corrección', async () => {
    const { s, ollama } = crear(['El límite es 80 µg/m³ [LIM-PM10-24H].', 'El límite es 75 µg/m³ [LIM-PM10-24H].']);
    const r = await s.preguntar('¿Cuál es el límite de PM10?');
    expect(r).toMatchObject({ origen: 'llm', intentos: 2 });
    expect(r.problemas[0]).toContain('80');
    expect(ollama.vistos[1].at(-1)!.content).toContain('rechazada');
  });

  it('una cita inventada o ausente cuenta como rechazo', async () => {
    const { s } = crear(['Es 75 [LIM-OTRO].', 'Es 75 sin cita.', 'Es 75 [LIM-PM10-24H].']);
    const r = await s.preguntar('¿Cuál es el límite de PM10?');
    expect(r.intentos).toBe(3);
    expect(r.problemas).toHaveLength(2);
    expect(r.problemas[0]).toContain('LIM-OTRO');
    expect(r.problemas[1]).toContain('no citaste');
  });

  it('si el modelo insiste en inventar, responde el código con los fragmentos tal cual', async () => {
    const { s, ollama } = crear(['Son 99 [LIM-PM10-24H].', 'Son 99 [LIM-PM10-24H].', 'Son 99 [LIM-PM10-24H].']);
    const r = await s.preguntar('¿Cuál es el límite de PM10?');
    expect(ollama.vistos).toHaveLength(3);
    expect(r.origen).toBe('extractiva');
    expect(r.respuesta).toContain('75 µg/m³');
    expect(r.respuesta).not.toContain('99');
    expect(r.citas[0].clave).toBe('LIM-PM10-24H');
  });

  it('sin fragmentos suficientemente parecidos no se llama al modelo', async () => {
    // 0,15: lo más alto que dio una pregunta sin relación con EmbeddingGemma (medido el 2026-11-10)
    const { s, ollama } = crear(['no debería usarse'], [{ ...LIM, similitud: 0.15 }]);
    const r = await s.preguntar('¿Cuál es la capital de Francia?');
    expect(r).toMatchObject({ origen: 'sin_resultados', respuesta: SIN_RESPUESTA, citas: [] });
    expect(ollama.vistos).toHaveLength(0);
  });

  it('si el modelo dice que no lo encuentra, se respeta', async () => {
    const { s } = crear([SIN_RESPUESTA]);
    expect(await s.preguntar('¿Cuál es la multa por excederse?')).toMatchObject({ origen: 'sin_resultados', respuesta: SIN_RESPUESTA, citas: [] });
  });

  it('con el índice vacío pide indexar antes', async () => {
    const { s } = crear([], [LIM], 0);
    await expect(s.preguntar('¿Cuál es el límite de PM10?')).rejects.toMatchObject({ status: 409 });
  });

  it('el umbral de similitud sale de la configuración (0,30)', async () => {
    const { s, ollama } = crear(['x'], [{ ...LIM, similitud: 0.29 }]);
    expect((await s.preguntar('algo sin relación')).origen).toBe('sin_resultados');
    expect(ollama.vistos).toHaveLength(0);
  });
});

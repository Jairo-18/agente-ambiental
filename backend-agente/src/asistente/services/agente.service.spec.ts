import { crearAgente, llamada } from '../../../test/helpers/dobles';
import { CSV_OCTUBRE } from '../../../test/helpers/servicios';
import { llamadasDe } from './agente.service';

const NOMBRES = ['listar_archivos_de_datos', 'revisar_datos', 'evaluar_valor', 'generar_reporte', 'consultar_reporte', 'consultar_norma'];
const GENERAR = { archivo: CSV_OCTUBRE, periodo: '2026-10', con_llm: false };
const herramientas = (t: { llamadas: { herramienta: string }[] }) => t.llamadas.map((l) => l.herramienta);

describe('análisis de las llamadas del modelo', () => {
  it('acepta tool_calls nativas y las que el modelo escribió como JSON en el texto', () => {
    expect(llamadasDe({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'revisar_datos', arguments: { archivo: 'a.csv' } } }] }, NOMBRES))
      .toEqual([{ nombre: 'revisar_datos', args: { archivo: 'a.csv' } }]);
    expect(llamadasDe({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'revisar_datos', arguments: '{"archivo": "a.csv"}' } }] }, NOMBRES))
      .toEqual([{ nombre: 'revisar_datos', args: { archivo: 'a.csv' } }]);
    const texto = 'Voy a revisar: {"name": "revisar_datos", "arguments": {"archivo": "a.csv", "periodo": "2026-10"}} y listo';
    expect(llamadasDe({ role: 'assistant', content: texto }, NOMBRES)).toEqual([{ nombre: 'revisar_datos', args: { archivo: 'a.csv', periodo: '2026-10' } }]);
    expect(llamadasDe({ role: 'assistant', content: '{"name": "borrar_todo", "arguments": {}}' }, NOMBRES)).toEqual([]); // nombre inexistente
    expect(llamadasDe({ role: 'assistant', content: 'hola {no es json} adiós' }, NOMBRES)).toEqual([]);
    expect(llamadasDe({ role: 'assistant', content: 'hola' }, NOMBRES)).toEqual([]);
  });

  it('acepta el nombre de la herramienta escrito justo antes del JSON (regresión: qwen2.5 con consultar_norma)', () => {
    const texto = 'sourceMapping:consultar_norma\n{"pregunta":"Cuánto ruido se permite de noche"}\n sourceMapping:';
    expect(llamadasDe({ role: 'assistant', content: texto }, NOMBRES)).toEqual([{ nombre: 'consultar_norma', args: { pregunta: 'Cuánto ruido se permite de noche' } }]);
    expect(llamadasDe({ role: 'assistant', content: 'borrar_todo {"x": 1}' }, NOMBRES)).toEqual([]);
    // más formatos vistos en la evaluación (I2 y N1)
    expect(llamadasDe({ role: 'assistant', content: 'consultar_norma({"pregunta": "ruido nocturno"})' }, NOMBRES)).toEqual([{ nombre: 'consultar_norma', args: { pregunta: 'ruido nocturno' } }]);
    expect(llamadasDe({ role: 'assistant', content: 'sourceMapping: revisar_datos  sourceMapping: {"archivo": "a.csv"}' }, NOMBRES)).toEqual([{ nombre: 'revisar_datos', args: { archivo: 'a.csv' } }]);
  });

  it('unos argumentos ilegibles no rompen el bucle', () => {
    expect(llamadasDe({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'listar_archivos_de_datos', arguments: '{no es json' } }] }, NOMBRES))
      .toEqual([{ nombre: 'listar_archivos_de_datos', args: {} }]);
  });

  it('las llaves dentro de las comillas no confunden al analizador', () => {
    const texto = '{"name": "consultar_norma", "arguments": {"pregunta": "¿qué es {esto}?"}}';
    expect(llamadasDe({ role: 'assistant', content: texto }, NOMBRES)).toEqual([{ nombre: 'consultar_norma', args: { pregunta: '¿qué es {esto}?' } }]);
  });
});

describe('AgenteService: el bucle', () => {
  it('una pregunta general se responde sin herramientas', async () => {
    const { agente, ollama } = crearAgente();
    ollama.encolar('Hago reportes mensuales de calidad del aire de Bogotá.');
    const t = await agente.responder('¿Qué sabes hacer?');
    expect(t).toMatchObject({ origen: 'llm', llamadas: [], problemas: [] });
    expect(t.respuesta).toContain('calidad del aire');
  });

  it('el flujo completo desde una frase: lista, revisa, genera; y la respuesta la escribe el código', async () => {
    const { agente, ollama, reportes } = crearAgente();
    ollama.encolar(
      llamada('listar_archivos_de_datos'),
      llamada('revisar_datos', { archivo: CSV_OCTUBRE, periodo: '2026-10' }),
      llamada('generar_reporte', GENERAR),
      'ESTO NO DEBE LLEGAR AL USUARIO',
    );
    const t = await agente.responder('hazme el reporte de aire de octubre 2026');
    expect(herramientas(t)).toEqual(['listar_archivos_de_datos', 'revisar_datos', 'generar_reporte']);
    // tras generar, el modelo no vuelve a hablar
    expect(t).toMatchObject({ origen: 'plantilla', pasos: 3 });
    expect(ollama.respuestas).toEqual(['ESTO NO DEBE LLEGAR AL USUARIO']);
    expect(t.respuesta).toContain('octubre de 2026 generado: reports/2026-10_aire/reporte.docx');
    for (const s of ['Kennedy', '80.24', 'preliminares', 'Revisión de los datos: 8 avisos y 0 errores']) expect(t.respuesta).toContain(s);
    expect(reportes.almacen.existe('2026-10')).toBe(true);
  }, 60000);

  it('lo que el modelo diga de un reporte generado no llega al usuario (regresión: "sin excedencias" siendo falso)', async () => {
    const { agente, ollama } = crearAgente();
    ollama.encolar(llamada('generar_reporte', GENERAR), 'Reporte listo. No se reportan excedencias.');
    const t = await agente.responder('reporte de octubre 2026');
    expect(t.respuesta).not.toContain('No se reportan excedencias');
    expect(t.respuesta).toContain('Kennedy');
  }, 60000);

  it('si falta el periodo el modelo pregunta, y la conversación sigue con el contexto', async () => {
    const { agente, ollama } = crearAgente();
    ollama.encolar(
      llamada('listar_archivos_de_datos'),
      '¿De qué mes quieres el reporte? Tengo datos de octubre de 2026.',
      llamada('revisar_datos', { archivo: CSV_OCTUBRE, periodo: '2026-10' }),
      'Los datos de octubre tienen 744 horas esperadas; ¿genero el reporte?',
    );
    const pregunta = await agente.responder('hazme un reporte');
    expect(herramientas(pregunta)).toEqual(['listar_archivos_de_datos']);
    expect(pregunta.respuesta).toContain('¿De qué mes');
    const t = await agente.responder('el de octubre de 2026');
    expect(herramientas(t)).toEqual(['revisar_datos']);
    expect(t.respuesta).toContain('744');
    expect(ollama.vistos.at(-1)!.some((m) => m.role === 'user' && m.content === 'hazme un reporte')).toBe(true);
  });

  it('una cifra inventada se rechaza y se corrige tras la realimentación', async () => {
    const { agente, ollama } = crearAgente();
    ollama.encolar(
      llamada('evaluar_valor', { contaminante: 'PM10', promedio: '24h', valor: 80.24 }),
      'Con 80.24 µg/m³ excede, y el límite es 100 µg/m³.', // 100 no está en ningún resultado
      'Con 80.24 µg/m³ excede el límite de 75 µg/m³.',
    );
    const t = await agente.responder('¿80.24 de PM10 en 24 h cumple?');
    expect(t).toMatchObject({ origen: 'llm' });
    expect(t.problemas).toHaveLength(1);
    expect(t.problemas[0]).toContain('100');
    expect(t.respuesta).toContain('75');
    expect(JSON.stringify(ollama.vistos.at(-1))).toContain('rechazada');
  });

  it('si el modelo insiste en inventar, responde el código', async () => {
    const { agente, ollama } = crearAgente();
    ollama.encolar(llamada('evaluar_valor', { contaminante: 'PM10', promedio: '24h', valor: 80.24 }), 'El límite es 100.', 'El límite es 100.', 'El límite es 100.');
    const t = await agente.responder('¿80.24 de PM10 en 24 h cumple?');
    expect(t.origen).toBe('codigo');
    expect(t.problemas).toHaveLength(3);
    expect(t.respuesta).not.toContain('100');
    expect(t.respuesta).toContain('excede');
  });

  it('el aviso de rechazo no se convierte en fuente (regresión: citaba la cifra rechazada)', async () => {
    const { agente, ollama } = crearAgente();
    ollama.encolar('Kennedy tuvo 999 de PM10.', 'Kennedy tuvo 999 de PM10.', 'Kennedy tuvo 999 de PM10.');
    const t = await agente.responder('háblame de Kennedy');
    expect(t.origen).toBe('codigo');
    expect(t.problemas).toHaveLength(3);
  });

  it('las cifras del prompt y los argumentos aceptados por la herramienta son fuentes válidas', async () => {
    const { agente, ollama } = crearAgente();
    ollama.encolar('Trabajo con la Resolución 2254 de 2017.');
    expect((await agente.responder('¿en qué norma te basas?')).problemas).toEqual([]);
    ollama.encolar(llamada('revisar_datos', { archivo: CSV_OCTUBRE, periodo: '2026-10' }), 'Revisé el periodo 2026-10: hay 744 horas esperadas.');
    const t = await agente.responder('revisa el mes pasado');
    expect(t).toMatchObject({ origen: 'llm', problemas: [] });
  });

  it('un nombre de archivo inventado se rechaza (regresión: "rmcab_10_largo.csv")', async () => {
    const { agente, ollama } = crearAgente();
    ollama.encolar(llamada('listar_archivos_de_datos'), 'Tengo rmcab_10_largo.csv.', `Tengo ${CSV_OCTUBRE}.`);
    const t = await agente.responder('¿qué datos hay?');
    expect(t.origen).toBe('llm');
    expect(t.problemas).toHaveLength(1);
    expect(t.problemas[0]).toContain('rmcab_10_largo.csv');
    expect(t.respuesta).toContain(CSV_OCTUBRE);
  });

  it('no puede anunciar un reporte que no generó (regresión: "ha sido generado" sin llamar a la herramienta)', async () => {
    const { agente, ollama } = crearAgente();
    ollama.encolar('Ahora generaré el reporte. El reporte ha sido generado.', 'Voy a generar el reporte de octubre.', llamada('generar_reporte', GENERAR));
    const t = await agente.responder('hazme el reporte de aire de octubre 2026');
    expect(t.problemas).toHaveLength(2);
    expect(t.problemas[0]).toContain('no llamaste a generar_reporte');
    expect(JSON.stringify(ollama.vistos[1])).toContain('no llamaste a generar_reporte');
    expect(t.origen).toBe('plantilla');
  }, 60000);

  it('hablar de un reporte ya generado antes es válido', async () => {
    const { agente, ollama } = crearAgente();
    ollama.encolar(llamada('generar_reporte', GENERAR));
    await agente.responder('reporte de octubre 2026');
    ollama.encolar('Sí, el reporte quedó listo en reports/2026-10_aire.');
    const t = await agente.responder('¿ya está el reporte?');
    expect(t).toMatchObject({ origen: 'llm', problemas: [] });
  }, 60000);

  it('una misma llamada repetida no se ejecuta dos veces', async () => {
    const { agente, ollama } = crearAgente();
    const args = { archivo: CSV_OCTUBRE, periodo: '2026-10' };
    ollama.encolar(llamada('revisar_datos', args), llamada('revisar_datos', args), 'Revisado.');
    const t = await agente.responder('revisa octubre 2026');
    expect(t.llamadas[0].resultado.error).toBeUndefined();
    expect(t.llamadas[1].resultado.error).toContain('Ya llamaste');
    expect(t.origen).toBe('llm');
  });

  it('hay un límite de pasos', async () => {
    const { agente, ollama } = crearAgente();
    for (let m = 1; m <= 12; m++) ollama.encolar(llamada('evaluar_valor', { contaminante: 'PM10', promedio: '24h', valor: m }));
    const t = await agente.responder('evalúa muchos valores');
    expect(t.pasos).toBe(8);
    expect(t.origen).toBe('codigo');
    expect(ollama.respuestas).toHaveLength(4);
  });

  it('un error de herramienta llega al modelo y al usuario', async () => {
    const { agente, ollama } = crearAgente();
    ollama.encolar(llamada('revisar_datos', { archivo: 'no_existe.csv', periodo: '2026-10' }), 'No encontré ese archivo; usa listar_archivos_de_datos.');
    const t = await agente.responder('revisa no_existe.csv de octubre');
    expect(t.llamadas[0].resultado.error).toContain('No existe el archivo');
    expect(t.origen).toBe('llm');
  });

  it('consulta la norma con la herramienta y repite lo que devuelve, con su cita', async () => {
    const { agente, ollama } = crearAgente();
    ollama.encolar(llamada('consultar_norma', { pregunta: '¿Cuál es el límite de PM10?' }), 'El límite de PM10 en 24 horas es 75 µg/m³ [LIM-PM10-24H].');
    const t = await agente.responder('¿Cuál es el límite de PM10?');
    expect(t).toMatchObject({ origen: 'llm', problemas: [] });
    expect(t.respuesta).toContain('[LIM-PM10-24H]');
  });

  it('una conversación nueva olvida todo menos el prompt del sistema', async () => {
    const { agente, ollama } = crearAgente();
    ollama.encolar('Hola.');
    await agente.responder('hola');
    expect(agente.mensajes.length).toBe(3);
    agente.nuevaConversacion();
    expect(agente.mensajes).toHaveLength(1);
    expect(agente.mensajes[0].role).toBe('system');
  });

  it('el prompt limita el alcance, lleva la fecha de hoy y las reglas de uso de herramientas', () => {
    const { agente } = crearAgente();
    agente.nuevaConversacion(new Date('2026-11-05T12:00:00Z'));
    const s = agente.mensajes[0].content;
    for (const t of ['Hoy es 2026-11-05', 'MENSUAL de CALIDAD DEL AIRE', 'No calcules', 'no lo adivines', 'nunca inventes nombres de archivo', 'consultar_norma']) expect(s).toContain(t);
  });
});

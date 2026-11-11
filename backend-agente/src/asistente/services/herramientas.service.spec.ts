import { crearAgente } from '../../../test/helpers/dobles';
import { CSV_OCTUBRE } from '../../../test/helpers/servicios';
import { HERRAMIENTAS } from '../constants/asistente.constants';

const ARGS = { archivo: CSV_OCTUBRE, periodo: '2026-10', con_llm: false };

describe('HerramientasService', () => {
  it('las herramientas son fijas: ninguna ejecuta comandos ni recibe rutas', () => {
    const nombres = HERRAMIENTAS.map((t) => t.function.name);
    expect(nombres).toEqual([
      'registrar_reporte_ciudadano', 'consultar_reporte_ciudadano',
      'listar_archivos_de_datos', 'revisar_datos', 'evaluar_valor', 'generar_reporte', 'consultar_reporte', 'consultar_norma',
    ]);
    for (const t of HERRAMIENTAS) {
      const props = Object.keys((t.function.parameters as { properties: object }).properties);
      expect(props.filter((p) => ['command', 'comando', 'salida', 'ruta', 'path', 'directorio'].includes(p))).toEqual([]);
    }
  });

  it('lista los archivos de datos con su rango y estaciones', async () => {
    const { herramientas } = crearAgente();
    const r = await herramientas.ejecutar('listar_archivos_de_datos', {});
    const csv = r.archivos.find((a: { archivo: string }) => a.archivo === CSV_OCTUBRE);
    expect(csv).toMatchObject({ desde: '2026-10-01 01:00:00', hasta: '2026-11-01 00:00:00' });
    expect(csv.estaciones).toEqual(['Guaymaral', 'Kennedy', 'Puente Aranda']);
  });

  it('revisa los datos de octubre', async () => {
    const { herramientas } = crearAgente();
    const r = await herramientas.ejecutar('revisar_datos', { archivo: CSV_OCTUBRE, periodo: '2026-10' });
    expect(r).toMatchObject({ horas_esperadas: 744, minimo_para_evaluar_pct: 75 });
    expect(r.representatividad_pct.Kennedy.PM10).toBe(97.58);
  });

  it.each(['2026-13', 'octubre', '2026-1', ''])('un periodo inválido ("%s") es un error, no una excepción', async (periodo) => {
    const { herramientas } = crearAgente();
    for (const h of ['revisar_datos', 'generar_reporte']) {
      expect((await herramientas.ejecutar(h, { archivo: CSV_OCTUBRE, periodo })).error).toMatch(/AAAA-MM/);
    }
  });

  it.each(['../secreto.csv', '..\\x.csv', 'sub/datos.csv', 'inexistente.csv', 'datos.txt', 'C:\\Windows\\win.ini'])(
    'solo se leen archivos de la carpeta de datos: "%s"',
    async (archivo) => {
      const { herramientas } = crearAgente();
      expect((await herramientas.ejecutar('revisar_datos', { archivo, periodo: '2026-10' })).error).toContain('No existe el archivo de datos');
    },
  );

  it('evalúa un valor con el motor de reglas', async () => {
    const { herramientas } = crearAgente();
    const r = await herramientas.ejecutar('evaluar_valor', { contaminante: 'PM10', promedio: '24h', valor: 80.24 });
    expect(r).toMatchObject({ estado: 'excede', reglas: ['LIM-PM10-24H'], valor_ugm3: 80.24 });
    expect(r.fuentes.join(' ')).toContain('Res. 2254');
    expect((await herramientas.ejecutar('evaluar_valor', { contaminante: 'PM10', promedio: '24h', valor: 60 })).estado).toBe('cumple');
  });

  it('convierte las unidades al evaluar', async () => {
    const { herramientas } = crearAgente();
    const r = await herramientas.ejecutar('evaluar_valor', { contaminante: 'NO2', promedio: '1h', valor: 100, unidad: 'ppb' });
    expect(r).toMatchObject({ valor_ugm3: 188.04, estado: 'cumple' });
  });

  it('rechaza entradas malas al evaluar', async () => {
    const { herramientas } = crearAgente();
    expect((await herramientas.ejecutar('evaluar_valor', { contaminante: 'H2S', promedio: '1h', valor: 1 })).error).toContain('desconocido');
    expect((await herramientas.ejecutar('evaluar_valor', { contaminante: 'CO', promedio: 'anual', valor: 1 })).error).toContain('desconocido');
    expect((await herramientas.ejecutar('evaluar_valor', { contaminante: 'CO', promedio: '1h', valor: 'mucho' })).error).toContain('no es un número');
    expect((await herramientas.ejecutar('evaluar_valor', { contaminante: 'CO', promedio: '1h', valor: 1, unidad: 'mg/L' })).error).toBeDefined();
  });

  it('una herramienta desconocida o con argumentos malos devuelve un error', async () => {
    const { herramientas } = crearAgente();
    expect((await herramientas.ejecutar('run_command', { command: 'dir' })).error).toContain('desconocida');
    expect((await herramientas.ejecutar('revisar_datos', { ruta: 'x' })).error).toContain("'ruta' no existe");
    expect((await herramientas.ejecutar('revisar_datos', { archivo: 'x' })).error).toContain("falta 'periodo'");
    expect((await herramientas.ejecutar('revisar_datos', 'texto')).error).toContain('objeto JSON');
    expect((await herramientas.ejecutar('revisar_datos', null)).error).toContain('objeto JSON');
  });

  it('genera un reporte nuevo sin pedir confirmación', async () => {
    const { herramientas, confirmaciones, reportes } = crearAgente();
    const r = await herramientas.ejecutar('generar_reporte', ARGS);
    expect(r).toMatchObject({ generado: true, periodo: '2026-10', carpeta: 'reports/2026-10_aire' });
    expect(confirmaciones.pendiente()).toBeNull();
    expect(reportes.almacen.existe('2026-10')).toBe(true);
  }, 60000);

  it('sobrescribir exige confirmación humana: el modelo no puede saltársela', async () => {
    const { herramientas, confirmaciones, reportes } = crearAgente();
    await herramientas.ejecutar('generar_reporte', ARGS);
    const antes = reportes.repo.guardados.length;

    const espera = herramientas.ejecutar('generar_reporte', ARGS); // el mes ya tiene reporte
    await new Promise((r) => setTimeout(r, 50));
    expect(confirmaciones.pendiente()!.pregunta).toContain('¿Lo sobrescribo?');
    confirmaciones.responder(confirmaciones.pendiente()!.id, false);
    expect(await espera).toEqual({ generado: false, motivo: 'El usuario no confirmó sobrescribir el reporte existente.' });
    expect(reportes.repo.guardados).toHaveLength(antes); // no se generó otra versión

    const otra = herramientas.ejecutar('generar_reporte', ARGS);
    await new Promise((r) => setTimeout(r, 50));
    confirmaciones.responder(confirmaciones.pendiente()!.id, true);
    expect((await otra).generado).toBe(true);
    expect(reportes.repo.guardados).toHaveLength(antes + 1);
  }, 90000);

  it('un mes sin datos en el archivo es un error y no genera nada', async () => {
    const { herramientas, reportes } = crearAgente();
    const r = await herramientas.ejecutar('generar_reporte', { ...ARGS, periodo: '2026-09' });
    expect(r.error).toContain('no tiene datos de septiembre de 2026');
    expect(reportes.almacen.periodos()).toEqual([]);
  });

  it('consulta los hechos de un reporte generado', async () => {
    const { herramientas } = crearAgente();
    const args = { periodo: '2026-10', estacion: 'Kennedy', contaminante: 'PM10' };
    expect((await herramientas.ejecutar('consultar_reporte', args)).error).toContain('Genéralo primero');
    await herramientas.ejecutar('generar_reporte', ARGS);
    const r = await herramientas.ejecutar('consultar_reporte', args);
    expect(r.media_mensual_ugm3).toBe(35.82);
    expect(r.promedios['24h'].n_excedencias).toBe(1);
    expect((await herramientas.ejecutar('consultar_reporte', { ...args, estacion: 'Suba' })).error).toContain('Hay:');
  }, 60000);

  it('consulta la norma y devuelve la respuesta con sus citas', async () => {
    const { herramientas } = crearAgente();
    const r = await herramientas.ejecutar('consultar_norma', { pregunta: '¿Límite de PM10?' });
    expect(r.respuesta).toContain('[LIM-PM10-24H]');
    expect(r.citas[0]).toMatchObject({ clave: 'LIM-PM10-24H', fuente: 'Res. 2254/2017' });
  });
});

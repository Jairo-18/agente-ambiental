import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { carpetaTemporal, crearReportes, OllamaFalso } from '../../../test/helpers/dobles';
import { CSV_OCTUBRE, XLSX_OCTUBRE, crearConfig, crearDatos } from '../../../test/helpers/servicios';
import { Hechos } from '../../analisis/interfaces/analisis.interface';
import { AlmacenReportesService } from './almacen-reportes.service';

const BUENA_PM10 = 'Kennedy registró la media mensual más alta de PM10, con 35.82 µg/m³, y el máximo diario más alto, de 80.24 µg/m³ el 28 de octubre.';

describe('ReportesService.generar (octubre de 2026, sin modelo)', () => {
  const ctx = crearReportes();
  let resultado: Awaited<ReturnType<typeof ctx.servicio.generar>>;
  beforeAll(async () => {
    resultado = await ctx.servicio.generar({ archivo: CSV_OCTUBRE, periodo: '2026-10', conLlm: false, descarga: '2026-11-03' });
  }, 60000);

  it('escribe el DOCX, los hechos, la trazabilidad y los tres gráficos', () => {
    expect(ctx.almacen.archivosDe('2026-10')).toEqual(['reporte.docx', 'trazabilidad.md', 'hechos.json', 'pm10_diario.png', 'pm25_diario.png', 'gases_medias.png']);
    expect(resultado).toMatchObject({ generado: true, periodo: '2026-10', carpeta: 'reports/2026-10_aire', archivo: 'reporte.docx', reporteId: 1 });
  });

  it('el resumen para el usuario lo escribe el código y trae lo importante', () => {
    expect(resultado.excedencias.map((e) => `${e.estacion}/${e.contaminante}`)).toEqual(['Kennedy/PM10', 'Kennedy/PM2.5']);
    expect(resultado.series_no_evaluables.map((s) => `${s.estacion}/${s.contaminante}`)).toEqual(['Kennedy/O3', 'Puente Aranda/SO2']);
    for (const s of ['Kennedy', '80.24', '41.29', 'preliminares']) expect(resultado.texto_usuario).toContain(s);
    expect(Object.values(resultado.redaccion).every((o) => o === 'plantilla')).toBe(true);
    expect(ctx.ollama.chatSimpleLlamadas).toEqual([]); // sin modelo no se le pregunta nada
  });

  it('guarda en la base el detalle y marca el reporte como generado', () => {
    const g = ctx.repo.guardados[0];
    expect(g).toMatchObject({ archivoDatos: CSV_OCTUBRE, conLlm: false, origen: 'generado', carpeta: 'reports/2026-10_aire' });
    expect(g.detalle.excedencias).toHaveLength(2);
    expect(g.detalle.archivos).toContain('reporte.docx');
  });

  it('el DOCX es un Word válido con las 12 secciones y las cifras de los hechos', async () => {
    const zip = await JSZip.loadAsync(readFileSync(ctx.almacen.rutaDe('2026-10', 'reporte.docx')!));
    const xml = await zip.file('word/document.xml')!.async('string');
    const texto = xml.replace(/<[^>]+>/g, ' ');
    for (let i = 1; i <= 12; i++) expect(texto).toMatch(new RegExp(`${i}\\. `));
    for (const s of ['Informe mensual de calidad del aire — octubre de 2026', '80.24', 'descargados el 2026-11-03', 'No evaluable', 'Resolución 2254']) expect(texto).toContain(s);
    expect(Object.keys(zip.files).filter((n) => n.startsWith('word/media/'))).toHaveLength(3);
  });

  it('la trazabilidad dice la regla y la fuente de cada conclusión', () => {
    const t = readFileSync(ctx.almacen.rutaDe('2026-10', 'trazabilidad.md')!, 'utf-8');
    expect(t).toContain('# Trazabilidad — octubre de 2026');
    expect(t).toContain('regla `LIM-PM10-24H` (Res. 2254/2017, Art. 2, Tabla 1 y Parágrafo 1)');
    expect(t).toContain('regla `NIV-PM25-24H-PREVENCION`');
    expect(t).toContain('Kennedy · O3: 56.05 % de horas válidas (< 75 %)');
    expect(t).toContain('`comentario_pm10`: plantilla');
  });

  it('los hechos guardados se pueden consultar por estación y contaminante', () => {
    const x = ctx.servicio.consultar('2026-10', 'Kennedy', 'PM10') as { media_mensual_ugm3: number; promedios: Record<string, { n_excedencias: number }> };
    expect(x.media_mensual_ugm3).toBe(35.82);
    expect(x.promedios['24h'].n_excedencias).toBe(1);
    expect(() => ctx.servicio.consultar('2026-10', 'Suba', 'PM10')).toThrow(/Hay: Guaymaral, Kennedy, Puente Aranda/);
    expect(() => ctx.servicio.consultar('2026-10', 'Kennedy', 'XX')).toThrow(/no está en el reporte/);
    expect(() => ctx.servicio.consultar('2026-09', 'Kennedy', 'PM10')).toThrow(/Genéralo primero/);
  });

  it('el reporte que ya está en disco se importa a la base una sola vez', async () => {
    const otro = crearReportes(new OllamaFalso(), ctx.reportsDir); // mismo disco, base vacía
    expect(await otro.servicio.sincronizar()).toEqual(['2026-10']);
    expect(otro.repo.guardados[0]).toMatchObject({ origen: 'importado', conLlm: null, redaccion: {} });
    expect(await otro.servicio.sincronizar()).toEqual([]);
  });
});

describe('ReportesService.generar con modelo', () => {
  it('el modelo describe PM10 y lo normativo lo sigue escribiendo el código', async () => {
    const ollama = new OllamaFalso().encolar(BUENA_PM10, 'Kennedy tuvo 999 µg/m³.', 'Kennedy tuvo 999 µg/m³.', 'Kennedy tuvo 999 µg/m³.', 'Puente Aranda tuvo el NO2 más alto, con 51.03 µg/m³.');
    const ctx = crearReportes(ollama);
    const r = await ctx.servicio.generar({ archivo: CSV_OCTUBRE, periodo: '2026-10', conLlm: true });
    expect(r.redaccion).toEqual({ resumen: 'plantilla', comentario_pm10: 'llm', comentario_pm25: 'plantilla', comentario_gases: 'llm', conclusiones: 'plantilla' });
    const t = readFileSync(ctx.almacen.rutaDe('2026-10', 'trazabilidad.md')!, 'utf-8');
    expect(t).toContain('`comentario_pm25`: plantilla, 3 intento(s)');
    expect(t).toContain('rechazado: intento 1: cifras fuera de los hechos ["999"]');
    expect(ctx.repo.guardados[0]).toMatchObject({ conLlm: true });
    const docx = await JSZip.loadAsync(readFileSync(ctx.almacen.rutaDe('2026-10', 'reporte.docx')!));
    const texto = (await docx.file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, ' ');
    expect(texto).toContain('35.82');
    expect(texto).not.toContain('999');
    expect(texto).toContain('redactados por un modelo de lenguaje local');
  }, 60000);

  it('con Ollama caído el reporte sale igual, con plantillas', async () => {
    const ollama = new OllamaFalso().encolar(Object.assign(new Error('rechazado'), { name: 'ConnectionError' }), new Error('x'), new Error('x'));
    const ctx = crearReportes(ollama);
    const r = await ctx.servicio.generar({ archivo: CSV_OCTUBRE, periodo: '2026-10', conLlm: true });
    expect(Object.values(r.redaccion).every((o) => o === 'plantilla')).toBe(true);
  }, 60000);
});

describe('ReportesService: revisar y errores', () => {
  const ctx = crearReportes();

  it('revisa los datos de octubre sin escribir nada', async () => {
    const r = await ctx.servicio.revisar(CSV_OCTUBRE, '2026-10');
    expect(r).toMatchObject({ periodo: '2026-10', horas_esperadas: 744, minimo_para_evaluar_pct: 75 });
    expect(r.estaciones).toEqual(['Guaymaral', 'Kennedy', 'Puente Aranda']);
    expect(r.representatividad_pct.Kennedy.PM10).toBe(97.58);
    expect(r.representatividad_pct.Kennedy.O3).toBe(56.05);
    expect(r.n_advertencias_por_severidad).toEqual({ error: 0, aviso: 8, info: 2 });
    expect(r.advertencias).toHaveLength(8);
    expect(r.advertencias.every((a) => a.startsWith('[aviso]'))).toBe(true);
    expect(r.series_no_evaluables).toHaveLength(2);
    expect(ctx.almacen.periodos()).toEqual([]);
  });

  it('el Excel crudo de la RMCAB da la misma revisión que el CSV', async () => {
    const [x, c] = await Promise.all([ctx.servicio.revisar(XLSX_OCTUBRE, '2026-10'), ctx.servicio.revisar(CSV_OCTUBRE, '2026-10')]);
    expect(x.n_advertencias_por_severidad).toEqual(c.n_advertencias_por_severidad);
    expect(x.representatividad_pct).toEqual(c.representatividad_pct);
  }, 60000);

  it.each(['2026-13', 'octubre', '2026-1', '', '../x'])('el periodo "%s" se rechaza antes de tocar los datos', async (periodo) => {
    await expect(ctx.servicio.revisar(CSV_OCTUBRE, periodo)).rejects.toThrow(/AAAA-MM/);
    await expect(ctx.servicio.generar({ archivo: CSV_OCTUBRE, periodo, conLlm: false })).rejects.toThrow(/AAAA-MM/);
  });

  it('un mes que el archivo no cubre da un error claro y no genera un reporte vacío', async () => {
    await expect(ctx.servicio.generar({ archivo: CSV_OCTUBRE, periodo: '2026-09', conLlm: false })).rejects.toThrow(/no tiene datos de septiembre de 2026/);
    expect(ctx.almacen.periodos()).toEqual([]);
    expect(ctx.repo.guardados).toEqual([]);
  });

  it('un archivo que no existe o con ruta se rechaza', async () => {
    for (const archivo of ['no_existe.csv', '../datos.csv', 'C:\\Windows\\win.ini']) {
      await expect(ctx.servicio.generar({ archivo, periodo: '2026-10', conLlm: false })).rejects.toMatchObject({ status: 404 });
    }
  });

  it('lee los datos desde una carpeta propia cuando se configura', async () => {
    const vacia = crearDatos(carpetaTemporal());
    await expect(vacia.cargar(CSV_OCTUBRE)).rejects.toMatchObject({ status: 404 });
  });

  it('el almacén de pruebas usa la carpeta temporal y no la del proyecto', () => {
    expect(ctx.reportsDir).not.toContain('storage');
    expect(new AlmacenReportesService(crearConfig({ reportsDir: ctx.reportsDir })).periodos()).toEqual([]);
  });

  it('el último reporte y las versiones salen de la base; un mes sin reporte es 404', async () => {
    const solo = crearReportes();
    (solo.repo as any).ultimoDe = async () => null;
    await expect(solo.servicio.ultimo('2026-10')).rejects.toMatchObject({ status: 404 });
    await expect(solo.servicio.ultimo('hoy')).rejects.toMatchObject({ status: 400 });
  });

  it('solo entrega rutas de la lista cerrada de archivos', async () => {
    const g = crearReportes();
    await g.servicio.generar({ archivo: CSV_OCTUBRE, periodo: '2026-10', conLlm: false });
    expect(g.servicio.rutaDeArchivo('2026-10', 'reporte.docx')).toContain('reporte.docx');
    expect(g.servicio.tipoDe('reporte.docx')).toContain('wordprocessingml');
    for (const n of ['secreto.txt', '..', '../reporte.docx']) expect(() => g.servicio.rutaDeArchivo('2026-10', n)).toThrow(/No existe/);
  }, 60000);
});

describe('hechos de octubre en el reporte (cifras exactas)', () => {
  it('las cifras de los hechos que se escriben en disco son las del análisis', async () => {
    const ctx = crearReportes();
    await ctx.servicio.generar({ archivo: CSV_OCTUBRE, periodo: '2026-10', conLlm: false });
    const h = ctx.almacen.leerHechos('2026-10') as Hechos;
    const kennedy = h.estaciones.Kennedy.contaminantes['PM2.5'];
    expect(kennedy.disponible && kennedy.promedios['24h'].maximo?.valor_ugm3).toBe(41.29);
  }, 60000);
});

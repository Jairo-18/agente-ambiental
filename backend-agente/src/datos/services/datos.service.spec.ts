import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearDatos, cargarOctubre, CSV_OCTUBRE, DATA_DIR, XLSX_OCTUBRE } from '../../../test/helpers/servicios';
import { parsearFecha } from '../../shared/utils/fechas.util';

const datos = crearDatos();

describe('DatosService', () => {
  it('lista los archivos con el rango de fechas y las estaciones de los CSV', async () => {
    const lista = await datos.listar();
    const csv = lista.find((a) => a.archivo === CSV_OCTUBRE)!;
    expect(csv.desde).toBe('2026-10-01 01:00:00');
    expect(csv.hasta).toBe('2026-11-01 00:00:00');
    expect(csv.estaciones).toEqual(['Guaymaral', 'Kennedy', 'Puente Aranda']);
    expect(lista.find((a) => a.archivo === XLSX_OCTUBRE)!.aviso).toContain('Excel de la RMCAB');
  });

  it('carga el CSV de octubre: 52 columnas por 744 horas', async () => {
    const filas = await cargarOctubre();
    expect(filas).toHaveLength(52 * 744);
    expect(filas[0]).toEqual({ estacion: 'Guaymaral', fecha_hora: '2026-10-01 01:00:00', variable: 'PM10', valor: '17.0', unidad: 'µg/m3' });
  });

  it('el Excel crudo de la RMCAB da exactamente las mismas mediciones que el CSV', async () => {
    const [xlsx, csv] = await Promise.all([datos.cargar(XLSX_OCTUBRE), cargarOctubre()]);
    expect(xlsx).toHaveLength(csv.length);
    const clave = (f: { estacion: string; fecha_hora: string; variable: string }) => `${f.estacion}|${f.fecha_hora}|${f.variable}`;
    const delCsv = new Map(csv.map((f) => [clave(f), f]));
    let faltantes = 0;
    for (const f of xlsx) {
      const g = delCsv.get(clave(f));
      expect(g).toBeDefined();
      expect(f.unidad).toBe(g!.unidad);
      const [a, b] = [f.valor === null ? NaN : Number(f.valor), g!.valor === null ? NaN : Number(g!.valor)];
      if (Number.isNaN(b)) {
        expect(a).toBeNaN();
        faltantes++;
      } else {
        expect(a).toBeCloseTo(b, 9);
      }
    }
    expect(faltantes).toBeGreaterThan(1000); // la RMCAB trae muchos faltantes ('----')
  }, 60000);

  it.each(['../secreto.csv', '..\\x.csv', 'sub/datos.csv', 'inexistente.csv', 'rmcab_2026-10_largo.txt', '', 'C:\\Windows\\win.ini'])(
    'solo se leen archivos de la carpeta de datos: "%s" es 404',
    async (nombre) => {
      await expect(datos.cargar(nombre)).rejects.toMatchObject({ status: 404 });
    },
  );

  it('detecta un periodo sin datos en el archivo', async () => {
    const filas = await cargarOctubre();
    expect(datos.sinDatosDelPeriodo(filas, '2026-10')).toBeNull();
    expect(datos.sinDatosDelPeriodo(filas, '2026-09')).toMatch(/no tiene datos de septiembre de 2026; cubre de 2026-10-01 01:00:00 a 2026-11-01 00:00:00/);
    expect(datos.sinDatosDelPeriodo([], '2026-10')).toBe('El archivo no tiene fechas legibles.');
  });

  it('un CSV al que le faltan columnas se rechaza con el nombre de la columna', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'datos-'));
    writeFileSync(join(dir, 'malo.csv'), 'estacion,fecha_hora,variable,unidad\nK,2026-10-01 01:00:00,PM10,ug/m3\n');
    await expect(crearDatos(dir).cargar('malo.csv')).rejects.toThrow(/Faltan columnas obligatorias: \[valor\]/);
  });

  it('un CSV con BOM y valores vacíos se lee: vacío es dato faltante', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'datos-'));
    writeFileSync(join(dir, 'ok.csv'), '\uFEFFestacion,fecha_hora,variable,valor,unidad\nK,2026-10-01 01:00:00,PM10,,ug/m3\nK,2026-10-01 02:00:00,PM10,12.5,\n');
    const filas = await crearDatos(dir).cargar('ok.csv');
    expect(filas).toEqual([
      { estacion: 'K', fecha_hora: '2026-10-01 01:00:00', variable: 'PM10', valor: null, unidad: 'ug/m3' },
      { estacion: 'K', fecha_hora: '2026-10-01 02:00:00', variable: 'PM10', valor: '12.5', unidad: null },
    ]);
  });

  it('la carpeta de datos que no existe da una lista vacía, no un error', async () => {
    expect(await crearDatos(join(DATA_DIR, 'no-existe')).listar()).toEqual([]);
  });

  it('las fechas del CSV se leen como fin de periodo y la hora 24:00 del Excel pasa al día siguiente', async () => {
    const xlsx = await datos.cargar(XLSX_OCTUBRE);
    const ultima = Math.max(...xlsx.map((f) => parsearFecha(f.fecha_hora)));
    expect(new Date(ultima).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  }, 60000);
});

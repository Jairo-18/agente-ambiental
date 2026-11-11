import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { carpetaTemporal } from '../../../test/helpers/dobles';
import { crearConfig } from '../../../test/helpers/servicios';
import { AlmacenReportesService } from './almacen-reportes.service';

const nuevo = () => {
  const dir = carpetaTemporal();
  return { dir, almacen: new AlmacenReportesService(crearConfig({ reportsDir: dir })) };
};

describe('AlmacenReportesService', () => {
  it('guarda los archivos del reporte en la carpeta del periodo, sin dejar temporales', () => {
    const { dir, almacen } = nuevo();
    almacen.guardar('2026-10', { 'reporte.docx': Buffer.from('docx'), 'hechos.json': '{"a":1}' });
    expect(readdirSync(join(dir, '2026-10_aire')).sort()).toEqual(['hechos.json', 'reporte.docx']);
    expect(almacen.existe('2026-10')).toBe(true);
    expect(almacen.existe('2026-09')).toBe(false);
    expect(almacen.leerHechos('2026-10')).toEqual({ a: 1 });
    expect(almacen.leerHechos('2026-09')).toBeNull();
  });

  it('el periodo debe ser AAAA-MM (no se puede escapar de la carpeta con el periodo)', () => {
    const { almacen } = nuevo();
    for (const malo of ['../x', '2026-13', 'octubre', '', '2026-10/../..']) {
      expect(() => almacen.carpetaDe(malo)).toThrow(/AAAA-MM/);
    }
  });

  it('solo entrega los archivos de la lista cerrada, y solo si existen', () => {
    const { dir, almacen } = nuevo();
    almacen.guardar('2026-10', { 'reporte.docx': 'x', 'secreto.txt': 'no debe salir', 'trazabilidad.md': '#' });
    expect(almacen.rutaDe('2026-10', 'reporte.docx')).toBe(join(dir, '2026-10_aire', 'reporte.docx'));
    for (const nombre of ['secreto.txt', '../2026-10_aire/reporte.docx', '..\\x', 'pm10_diario.png', '']) expect(almacen.rutaDe('2026-10', nombre)).toBeNull();
    expect(almacen.archivosDe('2026-10')).toEqual(['reporte.docx', 'trazabilidad.md']);
  });

  it('lista los periodos que tienen reporte, en orden', () => {
    const { almacen } = nuevo();
    almacen.guardar('2026-10', { 'reporte.docx': 'x' });
    almacen.guardar('2026-08', { 'reporte.docx': 'x' });
    almacen.guardar('2026-09', { 'hechos.json': '{}' }); // sin DOCX: no cuenta como reporte
    expect(almacen.periodos()).toEqual(['2026-08', '2026-10']);
    expect(almacen.nombreCarpeta('2026-10')).toBe('reports/2026-10_aire');
    expect(Number.isFinite(almacen.fechaDe('2026-10').getTime())).toBe(true);
  });

  it('una carpeta que no existe da una lista vacía', () => {
    expect(new AlmacenReportesService(crearConfig({ reportsDir: join(carpetaTemporal(), 'no-existe') })).periodos()).toEqual([]);
  });

  it('al reescribir un reporte reemplaza el archivo y no deja el temporal', () => {
    const { dir, almacen } = nuevo();
    almacen.guardar('2026-10', { 'hechos.json': '{"v":1}' });
    almacen.guardar('2026-10', { 'hechos.json': '{"v":2}' });
    expect(almacen.leerHechos('2026-10')).toEqual({ v: 2 });
    expect(existsSync(join(dir, '2026-10_aire', 'hechos.json.tmp'))).toBe(false);
  });
});

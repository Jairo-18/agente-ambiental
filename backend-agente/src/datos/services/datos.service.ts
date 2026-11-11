import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parse } from 'csv-parse/sync';
import { AppConfig } from '../../config/configuration';
import { fmtFechaHora, indiceEsperado, mesTexto, parsearFecha } from '../../shared/utils/fechas.util';
import { ArchivoDatos, COLUMNAS_OBLIGATORIAS, FilaLarga } from '../interfaces/fila.interface';
import { RmcabXlsxService } from './rmcab-xlsx.service';

const EXTENSIONES = ['.csv', '.xlsx'];

/**
 * Los archivos de datos de entrada (`DATA_DIR`): CSV en formato estándar o Excel de la RMCAB. Solo se leen archivos
 * que estén directamente en esa carpeta: nunca una ruta que mande el usuario ni el modelo.
 */
@Injectable()
export class DatosService {
  private readonly cache = new Map<string, { mtime: number; filas: FilaLarga[] }>();

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly xlsx: RmcabXlsxService,
  ) {}

  private get dir(): string {
    return this.config.get('storage', { infer: true }).dataDir;
  }

  /** Ruta de un archivo de datos, o 404 si no existe, no es de un tipo conocido o trae una ruta en el nombre. */
  rutaDe(archivo: string): string {
    const nombre = basename(archivo ?? '');
    const ruta = join(this.dir, nombre);
    let existe = false;
    try {
      existe = statSync(ruta).isFile();
    } catch {
      /* no existe */
    }
    if (!nombre || nombre !== archivo || !EXTENSIONES.includes(extname(nombre).toLowerCase()) || !existe) {
      throw new NotFoundException(`No existe el archivo de datos '${archivo}'. Usa listar_archivos_de_datos.`);
    }
    return ruta;
  }

  async listar(): Promise<ArchivoDatos[]> {
    let nombres: string[] = [];
    try {
      nombres = readdirSync(this.dir).filter((n) => EXTENSIONES.includes(extname(n).toLowerCase())).sort();
    } catch {
      return [];
    }
    const out: ArchivoDatos[] = [];
    for (const archivo of nombres) {
      if (extname(archivo).toLowerCase() === '.xlsx') {
        out.push({ archivo, aviso: 'Excel de la RMCAB: se convierte al leerlo' });
        continue;
      }
      try {
        const filas = await this.cargar(archivo);
        const t = filas.map((f) => parsearFecha(f.fecha_hora)).filter((x) => !Number.isNaN(x));
        out.push({
          archivo,
          desde: t.length ? fmtFechaHora(Math.min(...t)) : undefined,
          hasta: t.length ? fmtFechaHora(Math.max(...t)) : undefined,
          estaciones: [...new Set(filas.map((f) => f.estacion).filter(Boolean))].sort(),
        });
      } catch (e) {
        out.push({ archivo, aviso: `No se pudo leer como formato estándar: ${(e as Error).message}` });
      }
    }
    return out;
  }

  /** Todas las filas del archivo en formato estándar. Se guarda en memoria mientras el archivo no cambie. */
  async cargar(archivo: string): Promise<FilaLarga[]> {
    const ruta = this.rutaDe(archivo);
    const mtime = statSync(ruta).mtimeMs;
    const guardado = this.cache.get(ruta);
    if (guardado && guardado.mtime === mtime) return guardado.filas;

    const filas = extname(ruta).toLowerCase() === '.xlsx' ? await this.xlsx.leer(ruta) : this.leerCsv(ruta);
    this.cache.set(ruta, { mtime, filas });
    return filas;
  }

  private leerCsv(ruta: string): FilaLarga[] {
    const crudo = parse(readFileSync(ruta, 'utf-8'), { columns: true, skip_empty_lines: true, bom: true }) as Record<string, string>[];
    const columnas = crudo.length ? Object.keys(crudo[0]) : [];
    const faltan = COLUMNAS_OBLIGATORIAS.filter((c) => !columnas.includes(c));
    if (crudo.length && faltan.length) throw new BadRequestException(`Faltan columnas obligatorias: [${faltan.join(', ')}]`);
    return crudo.map((r) => ({
      estacion: r.estacion,
      fecha_hora: r.fecha_hora,
      variable: r.variable,
      valor: r.valor === '' ? null : r.valor,
      unidad: r.unidad === '' ? null : r.unidad,
    }));
  }

  /** Mensaje de error si el archivo no trae ninguna fila del mes pedido (si no, saldría un reporte vacío). */
  sinDatosDelPeriodo(filas: FilaLarga[], periodo: string): string | null {
    const esperado = indiceEsperado(periodo);
    const [inicio, fin] = [esperado[0], esperado[esperado.length - 1]];
    const t = filas.map((f) => parsearFecha(f.fecha_hora)).filter((x) => !Number.isNaN(x));
    if (t.some((x) => x >= inicio && x <= fin)) return null;
    return t.length
      ? `El archivo no tiene datos de ${mesTexto(periodo)}; cubre de ${fmtFechaHora(Math.min(...t))} a ${fmtFechaHora(Math.max(...t))}.`
      : 'El archivo no tiene fechas legibles.';
  }
}

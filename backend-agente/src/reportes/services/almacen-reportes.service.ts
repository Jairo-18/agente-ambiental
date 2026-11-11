import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Hechos } from '../../analisis/interfaces/analisis.interface';
import { AppConfig } from '../../config/configuration';
import { ARCHIVOS_DEL_REPORTE, PERIODO_REGEX } from '../../shared/constants/aire.constants';

/**
 * Los archivos de cada reporte (DOCX, gráficos, hechos, trazabilidad), una carpeta `AAAA-MM_aire` por periodo. Es lo único
 * que el sistema escribe en disco, y lo único que la API deja descargar: una lista cerrada de nombres, nunca una ruta.
 */
@Injectable()
export class AlmacenReportesService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get raiz(): string {
    return this.config.get('storage', { infer: true }).reportsDir;
  }

  carpetaDe(periodo: string): string {
    if (!PERIODO_REGEX.test(periodo)) throw new BadRequestException('El periodo debe tener el formato AAAA-MM, por ejemplo 2026-10.');
    return join(this.raiz, `${periodo}_aire`);
  }

  /** Nombre de la carpeta relativo a la raíz (lo que se muestra al usuario). */
  nombreCarpeta(periodo: string): string {
    return `reports/${periodo}_aire`;
  }

  existe(periodo: string): boolean {
    return existsSync(join(this.carpetaDe(periodo), 'reporte.docx'));
  }

  guardar(periodo: string, archivos: Record<string, Buffer | string>): void {
    const dir = this.carpetaDe(periodo);
    mkdirSync(dir, { recursive: true });
    for (const [nombre, contenido] of Object.entries(archivos)) {
      const destino = join(dir, nombre);
      const temporal = `${destino}.tmp`;
      writeFileSync(temporal, contenido); // se escribe aparte y se renombra: nunca queda un archivo a medias
      renameSync(temporal, destino);
    }
  }

  leerHechos(periodo: string): Hechos | null {
    const ruta = join(this.carpetaDe(periodo), 'hechos.json');
    return existsSync(ruta) ? (JSON.parse(readFileSync(ruta, 'utf-8')) as Hechos) : null;
  }

  /** Ruta de un archivo descargable, o null si el nombre no está en la lista cerrada o no existe. */
  rutaDe(periodo: string, nombre: string): string | null {
    if (!(nombre in ARCHIVOS_DEL_REPORTE)) return null;
    const ruta = join(this.carpetaDe(periodo), nombre);
    return existsSync(ruta) ? ruta : null;
  }

  tipoDe(nombre: string): string {
    return ARCHIVOS_DEL_REPORTE[nombre];
  }

  archivosDe(periodo: string): string[] {
    return Object.keys(ARCHIVOS_DEL_REPORTE).filter((n) => this.rutaDe(periodo, n) !== null);
  }

  /** Periodos que tienen reporte en disco, de menor a mayor. */
  periodos(): string[] {
    if (!existsSync(this.raiz)) return [];
    return readdirSync(this.raiz)
      .map((n) => /^(\d{4}-\d{2})_aire$/.exec(n)?.[1])
      .filter((p): p is string => !!p && this.existe(p))
      .sort();
  }

  /** Cuándo se escribió el reporte (fecha del DOCX). */
  fechaDe(periodo: string): Date {
    return statSync(join(this.carpetaDe(periodo), 'reporte.docx')).mtime;
  }
}

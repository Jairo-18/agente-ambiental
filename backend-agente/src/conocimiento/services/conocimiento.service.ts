import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parse } from 'yaml';
import { AppConfig } from '../../config/configuration';
import { BaseConocimiento, EstacionReferencia, VariableCanonica } from '../interfaces/base-conocimiento.interface';
import { BaseReportesCiudadanos } from '../interfaces/reportes-ciudadanos.interface';

/** Carga (una sola vez) y ofrece la base de conocimiento: la norma, las estaciones, las variables y los reportes ciudadanos. */
@Injectable()
export class ConocimientoService implements OnModuleInit {
  private _base?: BaseConocimiento;
  private _estaciones?: Record<string, EstacionReferencia>;
  private _canonicas?: Record<string, VariableCanonica>;
  private _reportes?: BaseReportesCiudadanos;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit() {
    this.cargar();
  }

  private leer<T>(archivo: string): T {
    const dir = this.config.get('storage', { infer: true }).knowledgeDir;
    return parse(readFileSync(join(dir, archivo), 'utf-8')) as T;
  }

  private cargar() {
    this._base = this.leer<BaseConocimiento>('aire_res2254_2017.yaml');
    this._estaciones = this.leer<{ estaciones: Record<string, EstacionReferencia> }>('estaciones_rmcab.yaml').estaciones;
    this._canonicas = this.leer<{ variables_canonicas: Record<string, VariableCanonica> }>('esquema_reporte_aire_mensual.yaml').variables_canonicas;
    this._reportes = this.leer<BaseReportesCiudadanos>('reportes_ciudadanos_bogota.yaml');
  }

  get base(): BaseConocimiento {
    if (!this._base) this.cargar();
    return this._base!;
  }

  get estaciones(): Record<string, EstacionReferencia> {
    if (!this._estaciones) this.cargar();
    return this._estaciones!;
  }

  get variablesCanonicas(): Record<string, VariableCanonica> {
    if (!this._canonicas) this.cargar();
    return this._canonicas!;
  }

  /** Tipos de reporte ciudadano, canales oficiales, reglas de prioridad y normas (Bogotá). */
  get reportesCiudadanos(): BaseReportesCiudadanos {
    if (!this._reportes) this.cargar();
    return this._reportes!;
  }

  /** 'OZONO' -> 'O3'. null si la variable no tiene norma de calidad del aire (NO, NOX, HR...). */
  contaminanteDeVariable(nombreRmcab: string): string | null {
    for (const [clave, c] of Object.entries(this.base.contaminantes)) {
      if (c.nombres_rmcab.includes(nombreRmcab)) return clave;
    }
    return null;
  }
}

import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { DetalleReporte } from '../interfaces/detalle-reporte.interface';
import { AdvertenciaQaqc } from '../entities/advertenciaQaqc.entity';
import { Excedencia } from '../entities/excedencia.entity';
import { Reporte } from '../entities/reporte.entity';
import { Serie } from '../entities/serie.entity';

export interface NuevoReporte {
  detalle: DetalleReporte;
  archivoDatos: string;
  conLlm: boolean | null;
  carpeta: string;
  redaccion: Record<string, string>;
  origen: 'generado' | 'importado';
  /** Fecha original, para los reportes importados del disco. */
  generadoEn?: Date;
}

export interface Analitica {
  totales: { reportes_guardados: number; periodos: number; evaluaciones: number; mensajes: number };
  excedencias: { estacion: string; contaminante: string; promedio: string; veces: number; maximo_ugm3: number }[];
  noEvaluables: { estacion: string; contaminante: string; periodos: number; representatividad_media: number }[];
}

@Injectable()
export class ReporteRepository extends Repository<Reporte> {
  constructor(dataSource: DataSource) {
    super(Reporte, dataSource.createEntityManager());
  }

  /** Guarda el reporte y desglosa excedencias, series y advertencias en sus tablas, todo o nada. */
  async guardarCompleto(n: NuevoReporte): Promise<Reporte> {
    return this.manager.transaction(async (m) => {
      const d = n.detalle;
      const reporte = await m.save(
        m.create(Reporte, {
          periodo: d.periodo,
          archivoDatos: n.archivoDatos,
          conLlm: n.conLlm,
          origen: n.origen,
          carpeta: n.carpeta,
          resumen: d.resumen,
          redaccion: n.redaccion,
          detalle: d,
          nExcedencias: d.excedencias.length,
          ...(n.generadoEn ? { generadoEn: n.generadoEn } : {}),
        }),
      );
      await m.insert(
        Excedencia,
        d.excedencias.map((e) => ({
          reporte, estacion: e.estacion, contaminante: e.contaminante, promedio: e.promedio,
          fechaHora: e.fecha_hora, valorUgm3: e.valor_ugm3, limiteUgm3: e.limite_ugm3, reglaId: e.regla_id,
        })),
      );
      await m.insert(
        Serie,
        d.filas.map((f) => ({
          reporte, estacion: f.estacion, contaminante: f.contaminante, representatividadPct: f.representatividad,
          evaluable: f.evaluable, mediaUgm3: f.media, nExcedencias: f.excedencias,
        })),
      );
      await m.insert(
        AdvertenciaQaqc,
        d.advertencias.map((a) => ({
          reporte, codigo: a.codigo, severidad: a.severidad, mensaje: a.mensaje,
          estacion: a.estacion ?? null, variable: a.variable ?? null, cantidad: a.cantidad ?? null,
        })),
      );
      return reporte;
    });
  }

  ultimoDe(periodo: string): Promise<Reporte | null> {
    return this.findOne({ where: { periodo }, order: { generadoEn: 'DESC', reporteId: 'DESC' } });
  }

  versionesDe(periodo: string): Promise<Reporte[]> {
    return this.find({
      where: { periodo },
      select: { reporteId: true, generadoEn: true, archivoDatos: true, conLlm: true, origen: true, nExcedencias: true },
      order: { generadoEn: 'DESC', reporteId: 'DESC' },
    });
  }

  periodosGuardados(): Promise<string[]> {
    return this.createQueryBuilder('r').select('DISTINCT r.periodo', 'periodo').getRawMany().then((f) => f.map((x) => x.periodo));
  }

  /** El último reporte de cada periodo, con cuántas versiones tiene. */
  listarVigentes(): Promise<Record<string, unknown>[]> {
    return this.manager.query(
      `SELECT DISTINCT ON (r."periodo") r."reporteId" AS "id", r."periodo", r."generadoEn" AS "generado_en",
              r."archivoDatos" AS "archivo_datos", r."conLlm" AS "con_llm", r."origen",
              r."nExcedencias" AS "n_excedencias",
              (SELECT count(*)::int FROM "Reporte" v WHERE v."periodo" = r."periodo") AS "versiones"
         FROM "Reporte" r ORDER BY r."periodo" DESC, r."generadoEn" DESC, r."reporteId" DESC`,
    );
  }

  /** Lo que solo se puede preguntar teniendo todo en una base de datos: resumen entre reportes vigentes. */
  async analitica(): Promise<Analitica> {
    const vigentes = `(SELECT DISTINCT ON ("periodo") "reporteId" FROM "Reporte" ORDER BY "periodo", "generadoEn" DESC, "reporteId" DESC)`;
    const excedencias = await this.manager.query(
      `SELECT e."estacion", e."contaminante", e."promedio", count(*)::int AS "veces", max(e."valorUgm3")::float8 AS "maximo_ugm3"
         FROM "Excedencia" e WHERE e."reporteId" IN ${vigentes}
        GROUP BY e."estacion", e."contaminante", e."promedio" ORDER BY "veces" DESC, e."estacion"`,
    );
    const noEvaluables = await this.manager.query(
      `SELECT s."estacion", s."contaminante", count(*)::int AS "periodos",
              round(avg(s."representatividadPct")::numeric, 2)::float8 AS "representatividad_media"
         FROM "Serie" s WHERE s."reporteId" IN ${vigentes} AND NOT s."evaluable"
        GROUP BY s."estacion", s."contaminante" ORDER BY "periodos" DESC`,
    );
    const [totales] = await this.manager.query(
      `SELECT (SELECT count(*)::int FROM "Reporte") AS "reportes_guardados",
              (SELECT count(DISTINCT "periodo")::int FROM "Reporte") AS "periodos",
              (SELECT count(*)::int FROM "Evaluacion") AS "evaluaciones",
              (SELECT count(*)::int FROM "Mensaje") AS "mensajes"`,
    );
    return { totales, excedencias, noEvaluables };
  }
}

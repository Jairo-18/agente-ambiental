import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ReporteCiudadano } from '../entities/reporteCiudadano.entity';
import { ReporteCiudadanoEvento } from '../entities/reporteCiudadanoEvento.entity';

export interface ReporteParecido {
  radicado: string;
  tipo: string;
  localidad: string | null;
  direccion: string;
  estado: string;
  creadoEn: Date;
  similitud: number;
}

export interface FiltrosReportes {
  tipo?: string;
  estado?: string;
  prioridad?: string;
  localidad?: string;
  limite?: number;
}

/** Radicado del prototipo: RA-AAAA-NNNNN con el consecutivo de la tabla (el año es el de creación). */
export const radicadoDe = (id: number, fecha: Date) => `RA-${fecha.getFullYear()}-${String(id).padStart(5, '0')}`;

@Injectable()
export class ReporteCiudadanoRepository extends Repository<ReporteCiudadano> {
  constructor(private readonly dataSource: DataSource) {
    super(ReporteCiudadano, dataSource.createEntityManager());
  }

  /** Guarda el reporte, le asigna el radicado y deja el primer evento del historial, todo en una transacción. */
  crearConRadicado(datos: Partial<ReporteCiudadano>, autor: ReporteCiudadanoEvento['autor']): Promise<ReporteCiudadano> {
    return this.dataSource.transaction(async (m: EntityManager) => {
      const r = await m.save(ReporteCiudadano, m.create(ReporteCiudadano, { ...datos, estado: 'recibido' }));
      r.radicado = radicadoDe(r.reporteCiudadanoId, r.creadoEn);
      await m.update(ReporteCiudadano, r.reporteCiudadanoId, { radicado: r.radicado });
      await m.save(ReporteCiudadanoEvento, m.create(ReporteCiudadanoEvento, { reporte: r, estado: 'recibido', autor, nota: 'Reporte recibido y clasificado.' }));
      return r;
    });
  }

  conDetalle(radicado: string): Promise<ReporteCiudadano | null> {
    return this.findOne({
      where: { radicado },
      relations: { eventos: true, evidencias: { adjunto: true } },
      order: { eventos: { reporteCiudadanoEventoId: 'ASC' } },
    });
  }

  /**
   * Búsqueda híbrida (SQL + vector): reportes del mismo tipo de los últimos `dias` días, de la misma localidad si se conoce, cuya
   * descripción se parece (coseno) a la del nuevo. Sirve para avisar de posibles duplicados.
   */
  parecidos(vector: number[], opciones: { tipo: string; localidad: string | null; dias: number; minimo: number; limite: number; excluirId?: number }): Promise<ReporteParecido[]> {
    return this.query(
      `SELECT "radicado", "tipo", "localidad", "direccion", "estado", "creadoEn",
              (1 - ("embedding" <=> $1::vector))::float8 AS "similitud"
         FROM "ReporteCiudadano"
        WHERE "embedding" IS NOT NULL AND "radicado" IS NOT NULL
          AND "creadoEn" > now() - ($2 || ' days')::interval
          AND ($3::varchar IS NULL OR "localidad" = $3)
          AND ($4::int IS NULL OR "reporteCiudadanoId" <> $4)
          AND "tipo" = $7
          AND (1 - ("embedding" <=> $1::vector)) >= $5
        ORDER BY "embedding" <=> $1::vector
        LIMIT $6`,
      [`[${vector.join(',')}]`, String(opciones.dias), opciones.localidad, opciones.excluirId ?? null, opciones.minimo, opciones.limite, opciones.tipo],
    );
  }

  listar(f: FiltrosReportes): Promise<ReporteCiudadano[]> {
    const q = this.createQueryBuilder('r').orderBy('r.creadoEn', 'DESC').limit(Math.min(f.limite ?? 200, 500));
    if (f.tipo) q.andWhere('r.tipo = :tipo', { tipo: f.tipo });
    if (f.estado) q.andWhere('r.estado = :estado', { estado: f.estado });
    if (f.prioridad) q.andWhere('r.prioridad = :prioridad', { prioridad: f.prioridad });
    if (f.localidad) q.andWhere('r.localidad = :localidad', { localidad: f.localidad });
    return q.getMany();
  }

  /** Conteos por tipo, prioridad, estado y localidad (para el tablero). */
  async estadisticas() {
    const por = (campo: string) =>
      this.query(`SELECT COALESCE("${campo}", 'sin dato') AS "valor", count(*)::int AS "n" FROM "ReporteCiudadano" WHERE "radicado" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`);
    const [tipo, prioridad, estado, localidad, [totales]] = await Promise.all([
      por('tipo'), por('prioridad'), por('estado'), por('localidad'),
      this.query(`SELECT count(*)::int AS "total", count(*) FILTER (WHERE "emergencia")::int AS "emergencias",
                         count(*) FILTER (WHERE "estado" <> 'cerrado')::int AS "abiertos" FROM "ReporteCiudadano" WHERE "radicado" IS NOT NULL`),
    ]);
    return { ...totales, tipo, prioridad, estado, localidad };
  }
}

import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { NormaFragmento } from '../entities/normaFragmento.entity';

export interface FragmentoNorma {
  clave: string;
  tipo: string;
  titulo: string;
  texto: string;
  fuente: string;
  verificado: boolean;
}
export interface Hallazgo extends FragmentoNorma {
  similitud: number;
}

/** Un vector de pgvector en su forma de texto: '[0.1,0.2,...]'. */
export const vectorSql = (v: number[]): string => `[${v.join(',')}]`;

@Injectable()
export class NormaFragmentoRepository extends Repository<NormaFragmento> {
  constructor(dataSource: DataSource) {
    super(NormaFragmento, dataSource.createEntityManager());
  }

  async estado(): Promise<{ fragmentos: number; ultimaIndexacion: string | null }> {
    const [f] = await this.manager.query(`SELECT count(*)::int AS "n", max("indexadoEn")::text AS "ultimo" FROM "NormaFragmento"`);
    return { fragmentos: f.n, ultimaIndexacion: f.ultimo };
  }

  /** Inserta o actualiza los fragmentos y borra los que ya no están en la base de conocimiento, todo o nada. */
  async reemplazarTodos(fragmentos: FragmentoNorma[], vectores: number[][]): Promise<number> {
    await this.manager.transaction(async (m) => {
      for (let i = 0; i < fragmentos.length; i++) {
        const f = fragmentos[i];
        await m.query(
          `INSERT INTO "NormaFragmento" ("clave", "tipo", "titulo", "texto", "fuente", "verificado", "embedding", "indexadoEn")
           VALUES ($1, $2, $3, $4, $5, $6, $7::vector, now())
           ON CONFLICT ("clave") DO UPDATE SET "tipo" = EXCLUDED."tipo", "titulo" = EXCLUDED."titulo", "texto" = EXCLUDED."texto",
             "fuente" = EXCLUDED."fuente", "verificado" = EXCLUDED."verificado", "embedding" = EXCLUDED."embedding", "indexadoEn" = now()`,
          [f.clave, f.tipo, f.titulo, f.texto, f.fuente, f.verificado, vectorSql(vectores[i])],
        );
      }
      await m.query(`DELETE FROM "NormaFragmento" WHERE NOT ("clave" = ANY($1::text[]))`, [fragmentos.map((f) => f.clave)]);
    });
    return fragmentos.length;
  }

  /** Los k fragmentos más cercanos al vector (distancia coseno de pgvector). */
  masCercanos(vector: number[], k: number): Promise<Hallazgo[]> {
    return this.manager.query(
      `SELECT "clave", "tipo", "titulo", "texto", "fuente", "verificado",
              (1 - ("embedding" <=> $1::vector))::float8 AS "similitud"
         FROM "NormaFragmento" ORDER BY "embedding" <=> $1::vector LIMIT $2`,
      [vectorSql(vector), k],
    );
  }
}

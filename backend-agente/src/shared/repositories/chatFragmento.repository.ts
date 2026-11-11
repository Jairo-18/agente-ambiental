import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ChatFragmento } from '../entities/chatFragmento.entity';

export interface FragmentoEncontrado {
  chatFragmentoId: number;
  chatAdjuntoId: string;
  nombre: string;
  tipo: string;
  chatConversacionId: string | null;
  titulo: string | null;
  orden: number;
  texto: string;
  similitud: number;
}

@Injectable()
export class ChatFragmentoRepository extends Repository<ChatFragmento> {
  constructor(dataSource: DataSource) {
    super(ChatFragmento, dataSource.createEntityManager());
  }

  /**
   * Los `limite` fragmentos más parecidos al vector (distancia coseno, índice HNSW). Con `adjuntoIds`, solo dentro de
   * esos adjuntos (los de una conversación); sin ellos, en toda la memoria del chat.
   */
  async buscar(vector: number[], limite: number, adjuntoIds?: string[]): Promise<FragmentoEncontrado[]> {
    if (adjuntoIds && !adjuntoIds.length) return [];
    const params: unknown[] = [`[${vector.join(',')}]`, limite];
    const filtro = adjuntoIds ? `WHERE f."chatAdjuntoId" = ANY($3::uuid[])` : '';
    if (adjuntoIds) params.push(adjuntoIds);
    return this.query(
      `SELECT f."chatFragmentoId", f."chatAdjuntoId", a."nombre", a."tipo", a."chatConversacionId", c."titulo", f."orden", f."texto",
              (1 - (f."embedding" <=> $1::vector))::float8 AS "similitud"
         FROM "ChatFragmento" f
         JOIN "ChatAdjunto" a ON a."chatAdjuntoId" = f."chatAdjuntoId"
         LEFT JOIN "ChatConversacion" c ON c."chatConversacionId" = a."chatConversacionId"
         ${filtro}
        ORDER BY f."embedding" <=> $1::vector
        LIMIT $2`,
      params,
    );
  }
}

import { Injectable } from '@nestjs/common';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { ChatAdjunto } from '../entities/chatAdjunto.entity';

@Injectable()
export class ChatAdjuntoRepository extends Repository<ChatAdjunto> {
  constructor(dataSource: DataSource) {
    super(ChatAdjunto, dataSource.createEntityManager());
  }

  /** Con el archivo original (la columna `datos` no se carga por defecto). */
  conDatos(ids: string[]): Promise<ChatAdjunto[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.createQueryBuilder('a').addSelect('a.datos').where('a.chatAdjuntoId IN (:...ids)', { ids }).getMany();
  }

  /** Adjuntos subidos que todavía no se han enviado en ningún mensaje. */
  sueltos(ids: string[]): Promise<ChatAdjunto[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.find({ where: { chatAdjuntoId: In(ids), mensaje: IsNull() } });
  }

  deLaConversacion(chatConversacionId: string): Promise<ChatAdjunto[]> {
    return this.find({ where: { conversacion: { chatConversacionId } }, relations: { mensaje: true }, order: { creadoEn: 'ASC' } });
  }
}

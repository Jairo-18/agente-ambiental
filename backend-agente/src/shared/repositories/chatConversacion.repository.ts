import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ChatConversacion } from '../entities/chatConversacion.entity';

@Injectable()
export class ChatConversacionRepository extends Repository<ChatConversacion> {
  constructor(dataSource: DataSource) {
    super(ChatConversacion, dataSource.createEntityManager());
  }

  /** Las más recientes primero, con cuántos mensajes tiene cada una. */
  async listar(limite = 100): Promise<(ChatConversacion & { nMensajes: number })[]> {
    const { entities, raw } = await this.createQueryBuilder('c')
      .addSelect((q) => q.select('count(*)::int').from('ChatMensaje', 'm').where('m."chatConversacionId" = c."chatConversacionId"'), 'nMensajes')
      .orderBy('c.actualizadaEn', 'DESC')
      .limit(limite)
      .getRawAndEntities();
    return entities.map((c, i) => Object.assign(c, { nMensajes: raw[i].nMensajes as number }));
  }

  /** Marca la conversación como usada ahora (sube en la lista) y recuerda el último proveedor y modelo. */
  async tocar(conversacion: ChatConversacion, proveedor: string, modelo: string): Promise<void> {
    await this.update(conversacion.chatConversacionId, { proveedor, modelo, actualizadaEn: new Date() });
  }
}

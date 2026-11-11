import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ChatMensaje } from '../entities/chatMensaje.entity';

@Injectable()
export class ChatMensajeRepository extends Repository<ChatMensaje> {
  constructor(dataSource: DataSource) {
    super(ChatMensaje, dataSource.createEntityManager());
  }

  deLaConversacion(chatConversacionId: string): Promise<ChatMensaje[]> {
    return this.find({ where: { conversacion: { chatConversacionId } }, order: { chatMensajeId: 'ASC' } });
  }
}

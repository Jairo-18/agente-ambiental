import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Conversacion } from '../entities/conversacion.entity';

@Injectable()
export class ConversacionRepository extends Repository<Conversacion> {
  constructor(dataSource: DataSource) {
    super(Conversacion, dataSource.createEntityManager());
  }

  /** La conversación vigente es la última creada; si no hay ninguna, se crea. */
  async vigente(): Promise<Conversacion> {
    const ultima = await this.findOne({ where: {}, order: { creadaEn: 'DESC' } });
    return ultima ?? this.save(this.create());
  }

  nueva(): Promise<Conversacion> {
    return this.save(this.create());
  }
}

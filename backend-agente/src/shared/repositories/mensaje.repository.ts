import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Conversacion } from '../entities/conversacion.entity';
import { LlamadaHerramienta, Mensaje } from '../entities/mensaje.entity';

@Injectable()
export class MensajeRepository extends Repository<Mensaje> {
  constructor(dataSource: DataSource) {
    super(Mensaje, dataSource.createEntityManager());
  }

  registrar(
    conversacion: Conversacion,
    rol: 'usuario' | 'agente',
    contenido: string,
    herramientas: LlamadaHerramienta[] = [],
    origen: string | null = null,
  ): Promise<Mensaje> {
    return this.save(this.create({ conversacion, rol, contenido, herramientas, origen }));
  }

  deLaConversacion(conversacionId: string): Promise<Mensaje[]> {
    return this.find({ where: { conversacion: { conversacionId } }, order: { mensajeId: 'ASC' } });
  }
}

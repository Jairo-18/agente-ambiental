import { CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Mensaje } from './mensaje.entity';

@Entity({ name: 'Conversacion' })
export class Conversacion {
  @PrimaryGeneratedColumn('uuid')
  conversacionId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  creadaEn: Date;

  @OneToMany(() => Mensaje, (m) => m.conversacion)
  mensajes: Mensaje[];
}

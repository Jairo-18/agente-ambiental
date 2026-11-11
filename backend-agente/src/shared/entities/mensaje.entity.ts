import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Conversacion } from './conversacion.entity';

export interface LlamadaHerramienta {
  herramienta: string;
  argumentos: unknown;
  error: string | null;
}

@Entity({ name: 'Mensaje' })
@Check(`"rol" IN ('usuario', 'agente')`)
@Index(['conversacion', 'mensajeId'])
export class Mensaje {
  @PrimaryGeneratedColumn()
  mensajeId: number;

  @ManyToOne(() => Conversacion, (c) => c.mensajes, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversacionId' })
  conversacion: Conversacion;

  @Column('varchar', { length: 10 })
  rol: 'usuario' | 'agente';

  @Column('text')
  contenido: string;

  @Column('jsonb', { default: () => `'[]'` })
  herramientas: LlamadaHerramienta[];

  @Column('varchar', { length: 20, nullable: true })
  origen: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;
}

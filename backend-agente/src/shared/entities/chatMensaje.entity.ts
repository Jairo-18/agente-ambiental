import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ChatConversacion } from './chatConversacion.entity';

@Entity({ name: 'ChatMensaje' })
@Check(`"rol" IN ('usuario', 'asistente')`)
@Index(['conversacion', 'chatMensajeId'])
export class ChatMensaje {
  @PrimaryGeneratedColumn()
  chatMensajeId: number;

  @ManyToOne(() => ChatConversacion, (c) => c.mensajes, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chatConversacionId' })
  conversacion: ChatConversacion;

  @Column('varchar', { length: 10 })
  rol: 'usuario' | 'asistente';

  @Column('text')
  contenido: string;

  /** Razonamiento que expuso el modelo (DeepSeek, modelos "thinking" de Ollama), si lo hubo. */
  @Column('text', { nullable: true })
  razonamiento: string | null;

  /** Con qué se respondió (en los del usuario, a quién se le preguntó). */
  @Column('varchar', { length: 20 })
  proveedor: string;

  @Column('varchar', { length: 120 })
  modelo: string;

  /** Nivel de esfuerzo con que se respondió (low…max), si el modelo lo admite. */
  @Column('varchar', { length: 10, nullable: true })
  esfuerzo: string | null;

  @Column('int', { nullable: true })
  duracionMs: number | null;

  /** Si la respuesta falló o se detuvo: el motivo (el contenido guarda lo que alcanzó a llegar). */
  @Column('text', { nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;
}

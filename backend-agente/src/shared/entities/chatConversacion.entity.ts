import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ChatMensaje } from './chatMensaje.entity';

/** Una conversación del chat libre (Ollama, DeepSeek o Claude). Aparte de `Conversacion`, que es la del agente. */
@Entity({ name: 'ChatConversacion' })
@Index(['actualizadaEn'])
export class ChatConversacion {
  @PrimaryGeneratedColumn('uuid')
  chatConversacionId: string;

  @Column('varchar', { length: 120 })
  titulo: string;

  /** Último proveedor y modelo usados: la pantalla los vuelve a seleccionar al abrirla. */
  @Column('varchar', { length: 20 })
  proveedor: string;

  @Column('varchar', { length: 120 })
  modelo: string;

  @CreateDateColumn({ type: 'timestamptz' })
  creadaEn: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadaEn: Date;

  @OneToMany(() => ChatMensaje, (m) => m.conversacion)
  mensajes: ChatMensaje[];
}

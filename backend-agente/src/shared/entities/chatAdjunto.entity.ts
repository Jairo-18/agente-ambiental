import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ChatConversacion } from './chatConversacion.entity';
import { ChatFragmento } from './chatFragmento.entity';
import { ChatMensaje } from './chatMensaje.entity';

export type TipoAdjunto = 'documento' | 'imagen' | 'audio';
export type EstadoAdjunto = 'procesando' | 'listo' | 'error';

/**
 * Un archivo del chat libre (documento, imagen o nota de voz) guardado tal cual en la base (`bytea`), con su texto:
 * el extraído del documento, la transcripción del audio o la descripción de la imagen. Ese texto se parte en
 * `ChatFragmento` con su vector para buscarlo por significado (pgvector). Se sube antes de enviar el mensaje:
 * hasta entonces no tiene conversación ni mensaje.
 */
@Entity({ name: 'ChatAdjunto' })
@Check(`"tipo" IN ('documento', 'imagen', 'audio')`)
@Check(`"estado" IN ('procesando', 'listo', 'error')`)
@Index(['mensaje'])
@Index(['conversacion'])
export class ChatAdjunto {
  @PrimaryGeneratedColumn('uuid')
  chatAdjuntoId: string;

  @ManyToOne(() => ChatConversacion, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chatConversacionId' })
  conversacion: ChatConversacion | null;

  @ManyToOne(() => ChatMensaje, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chatMensajeId' })
  mensaje: ChatMensaje | null;

  @Column('varchar', { length: 12 })
  tipo: TipoAdjunto;

  @Column('varchar', { length: 255 })
  nombre: string;

  @Column('varchar', { length: 120 })
  mime: string;

  @Column('int')
  tamano: number;

  /** El archivo original. `select: false`: solo se lee cuando hace falta (descargarlo o mandarlo al modelo). */
  @Column('bytea', { select: false })
  datos: Buffer;

  /** Texto extraído / transcripción / descripción. */
  @Column('text', { nullable: true })
  texto: string | null;

  @Column('int', { nullable: true })
  paginas: number | null;

  /** Duración de la grabación (solo audio). */
  @Column('real', { nullable: true })
  duracionSeg: number | null;

  /**
   * true = nota de voz grabada con el micrófono: su transcripción ya es el texto del mensaje, así que no se le vuelve
   * a pasar al modelo como archivo (sí queda guardada e indexada). Un audio subido con 📎 sí se le pasa transcrito.
   */
  @Column('boolean', { default: false })
  dictado: boolean;

  @Column('varchar', { length: 12, default: 'listo' })
  estado: EstadoAdjunto;

  @Column('text', { nullable: true })
  error: string | null;

  /** true cuando su texto ya está en `ChatFragmento` con vectores. */
  @Column('boolean', { default: false })
  indexado: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;

  @OneToMany(() => ChatFragmento, (f) => f.adjunto)
  fragmentos: ChatFragmento[];
}

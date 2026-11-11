import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ChatAdjunto } from './chatAdjunto.entity';

/**
 * Un trozo del texto de un adjunto del chat (documento, transcripción de voz o descripción de imagen) con su vector
 * (nomic-embed-text, 768 dim.). Como en NormaFragmento, el índice HNSW de coseno lo crea la migración a mano.
 */
@Entity({ name: 'ChatFragmento' })
@Index(['adjunto', 'orden'])
export class ChatFragmento {
  @PrimaryGeneratedColumn()
  chatFragmentoId: number;

  @ManyToOne(() => ChatAdjunto, (a) => a.fragmentos, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chatAdjuntoId' })
  adjunto: ChatAdjunto;

  @Column('int')
  orden: number;

  @Column('text')
  texto: string;

  @Column({ type: 'vector', length: 768 } as any)
  embedding: number[];
}

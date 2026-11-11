import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Un fragmento de la norma con su vector. La dimensión (768) es la de nomic-embed-text.
 * El índice HNSW (distancia coseno) lo crea la migración a mano: TypeORM no sabe describirlo.
 */
@Entity({ name: 'NormaFragmento' })
export class NormaFragmento {
  @PrimaryColumn('varchar', { length: 60 })
  clave: string;

  @Column('varchar', { length: 20 })
  tipo: string;

  @Column('varchar', { length: 200 })
  titulo: string;

  @Column('text')
  texto: string;

  @Column('varchar', { length: 200 })
  fuente: string;

  /** false = supuesto del proyecto, no texto de la norma. */
  @Column('boolean')
  verificado: boolean;

  @Column({ type: 'vector', length: 768 } as any)
  embedding: number[];

  @UpdateDateColumn({ type: 'timestamptz' })
  indexadoEn: Date;
}

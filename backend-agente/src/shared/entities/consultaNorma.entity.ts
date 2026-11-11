import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Auditoría del buscador de la norma: qué se preguntó, qué se respondió y con qué citas. */
@Entity({ name: 'ConsultaNorma' })
export class ConsultaNorma {
  @PrimaryGeneratedColumn()
  consultaId: number;

  @Column('text')
  pregunta: string;

  @Column('text')
  respuesta: string;

  @Column('varchar', { length: 20 })
  origen: string;

  @Column('jsonb', { default: () => `'[]'` })
  citas: string[];

  @Column('int', { default: 0 })
  intentos: number;

  @CreateDateColumn({ type: 'timestamptz' })
  creadaEn: Date;
}

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Registro de auditoría de cada valor evaluado contra la norma (la evaluación la hace el motor de reglas). */
@Entity({ name: 'Evaluacion' })
export class Evaluacion {
  @PrimaryGeneratedColumn()
  evaluacionId: number;

  @Column('varchar', { length: 10 })
  contaminante: string;

  @Column('varchar', { length: 5 })
  promedio: string;

  @Column('double precision')
  valor: number;

  @Column('varchar', { length: 10 })
  unidad: string;

  @Column('varchar', { length: 20 })
  estado: string;

  @Column('varchar', { length: 20, nullable: true })
  nivel: string | null;

  @Column('text')
  conclusion: string;

  @Column('jsonb', { default: () => `'[]'` })
  reglas: string[];

  @Column('jsonb', { default: () => `'[]'` })
  fuentes: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  creadaEn: Date;
}

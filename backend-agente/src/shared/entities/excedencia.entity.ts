import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Reporte } from './reporte.entity';

@Entity({ name: 'Excedencia' })
@Index(['reporte'])
export class Excedencia {
  @PrimaryGeneratedColumn()
  excedenciaId: number;

  @ManyToOne(() => Reporte, (r) => r.excedencias, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporteId' })
  reporte: Reporte;

  @Column('varchar', { length: 100 })
  estacion: string;

  @Column('varchar', { length: 10 })
  contaminante: string;

  @Column('varchar', { length: 5 })
  promedio: string;

  @Column('varchar', { length: 20 })
  fechaHora: string;

  @Column('double precision')
  valorUgm3: number;

  @Column('double precision')
  limiteUgm3: number;

  @Column('varchar', { length: 50 })
  reglaId: string;
}

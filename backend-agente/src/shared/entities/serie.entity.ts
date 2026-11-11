import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Reporte } from './reporte.entity';

/** Una serie (estación y contaminante) de un reporte: cuánto dato válido tuvo y si pudo evaluarse. */
@Entity({ name: 'Serie' })
@Index(['reporte'])
export class Serie {
  @PrimaryGeneratedColumn()
  serieId: number;

  @ManyToOne(() => Reporte, (r) => r.series, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporteId' })
  reporte: Reporte;

  @Column('varchar', { length: 100 })
  estacion: string;

  @Column('varchar', { length: 10 })
  contaminante: string;

  @Column('double precision')
  representatividadPct: number;

  @Column('boolean')
  evaluable: boolean;

  @Column('double precision', { nullable: true })
  mediaUgm3: number | null;

  @Column('int', { default: 0 })
  nExcedencias: number;
}

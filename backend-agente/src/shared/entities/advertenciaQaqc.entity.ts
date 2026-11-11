import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Reporte } from './reporte.entity';

@Entity({ name: 'AdvertenciaQaqc' })
@Index(['reporte'])
export class AdvertenciaQaqc {
  @PrimaryGeneratedColumn()
  advertenciaId: number;

  @ManyToOne(() => Reporte, (r) => r.advertencias, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporteId' })
  reporte: Reporte;

  @Column('varchar', { length: 40 })
  codigo: string;

  @Column('varchar', { length: 10 })
  severidad: string;

  @Column('text')
  mensaje: string;

  @Column('varchar', { length: 100, nullable: true })
  estacion: string | null;

  @Column('varchar', { length: 100, nullable: true })
  variable: string | null;

  @Column('int', { nullable: true })
  cantidad: number | null;
}

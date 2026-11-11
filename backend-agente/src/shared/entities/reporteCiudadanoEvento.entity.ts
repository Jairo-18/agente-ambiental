import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ReporteCiudadano } from './reporteCiudadano.entity';

/** Historial de un reporte ciudadano: cada cambio de estado con quién lo hizo y por qué (trazabilidad). */
@Entity({ name: 'ReporteCiudadanoEvento' })
@Check(`"autor" IN ('agente', 'funcionario', 'ciudadano', 'sistema')`)
@Index(['reporte', 'reporteCiudadanoEventoId'])
export class ReporteCiudadanoEvento {
  @PrimaryGeneratedColumn()
  reporteCiudadanoEventoId: number;

  @ManyToOne(() => ReporteCiudadano, (r) => r.eventos, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporteCiudadanoId' })
  reporte: ReporteCiudadano;

  @Column('varchar', { length: 12 })
  estado: string;

  @Column('text', { nullable: true })
  nota: string | null;

  @Column('varchar', { length: 12 })
  autor: 'agente' | 'funcionario' | 'ciudadano' | 'sistema';

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;
}

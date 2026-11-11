import { Check, Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { DetalleReporte } from '../interfaces/detalle-reporte.interface';
import { AdvertenciaQaqc } from './advertenciaQaqc.entity';
import { Excedencia } from './excedencia.entity';
import { Serie } from './serie.entity';

/** Cada generación de un reporte es una versión nueva: regenerar un mes no borra la anterior. */
@Entity({ name: 'Reporte' })
@Check(`"periodo" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`)
@Index(['periodo', 'generadoEn'])
export class Reporte {
  @PrimaryGeneratedColumn()
  reporteId: number;

  @Column('varchar', { length: 7 })
  periodo: string;

  @Column('varchar', { length: 255 })
  archivoDatos: string;

  /** null cuando el reporte se importó del disco y no se sabe si el modelo redactó. */
  @Column('boolean', { nullable: true })
  conLlm: boolean | null;

  @Column('varchar', { length: 20, default: 'generado' })
  origen: 'generado' | 'importado';

  @CreateDateColumn({ type: 'timestamptz' })
  generadoEn: Date;

  @Column('varchar', { length: 255 })
  carpeta: string;

  @Column('text')
  resumen: string;

  /** Quién escribió cada texto: { comentario_pm10: 'llm' | 'plantilla', ... } */
  @Column('jsonb', { default: () => `'{}'` })
  redaccion: Record<string, string>;

  @Column('jsonb')
  detalle: DetalleReporte;

  @Column('int', { default: 0 })
  nExcedencias: number;

  @OneToMany(() => Excedencia, (e) => e.reporte)
  excedencias: Excedencia[];

  @OneToMany(() => Serie, (s) => s.reporte)
  series: Serie[];

  @OneToMany(() => AdvertenciaQaqc, (a) => a.reporte)
  advertencias: AdvertenciaQaqc[];
}

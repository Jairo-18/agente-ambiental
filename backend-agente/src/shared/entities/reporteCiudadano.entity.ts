import { Check, Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ReporteCiudadanoEvento } from './reporteCiudadanoEvento.entity';
import { ReporteEvidencia } from './reporteEvidencia.entity';

export const ESTADOS_REPORTE = ['recibido', 'en_revision', 'remitido', 'cerrado'] as const;
export type EstadoReporte = (typeof ESTADOS_REPORTE)[number];
export type Prioridad = 'alta' | 'media' | 'baja';

/**
 * Un reporte ambiental de un ciudadano de Bogotá (basura, tala, quema, ruido, aire, agua). El tipo final, la prioridad
 * y la entidad responsable los decide el código con las reglas del YAML; del modelo se guarda lo que propuso, para
 * poder evaluarlo. `embedding` es el vector de la descripción: sirve para encontrar reportes parecidos (duplicados).
 * El radicado (RA-AAAA-NNNNN) es interno del prototipo, no un radicado oficial de la SDA.
 */
@Entity({ name: 'ReporteCiudadano' })
@Check(`"tipo" IN ('residuos', 'arbolado', 'quema', 'ruido', 'aire', 'agua', 'otro')`)
@Check(`"prioridad" IN ('alta', 'media', 'baja')`)
@Check(`"estado" IN ('recibido', 'en_revision', 'remitido', 'cerrado')`)
@Check(`"canal" IN ('texto', 'voz', 'formulario')`)
@Index(['estado', 'prioridad'])
@Index(['creadoEn'])
export class ReporteCiudadano {
  @PrimaryGeneratedColumn()
  reporteCiudadanoId: number;

  @Index({ unique: true })
  @Column('varchar', { length: 20, nullable: true })
  radicado: string | null;

  @Column('varchar', { length: 12 })
  tipo: string;

  /** Lo que propuso el modelo y lo que dieron las reglas (trazabilidad y evaluación). */
  @Column('varchar', { length: 12, nullable: true })
  tipoModelo: string | null;

  @Column('varchar', { length: 12 })
  tipoReglas: string;

  @Column('text')
  descripcion: string;

  @Column('varchar', { length: 250 })
  direccion: string;

  @Column('varchar', { length: 40, nullable: true })
  localidad: string | null;

  @Column('varchar', { length: 80, nullable: true })
  barrio: string | null;

  @Column('double precision', { nullable: true })
  latitud: number | null;

  @Column('double precision', { nullable: true })
  longitud: number | null;

  /** Cuándo pasó, en palabras del ciudadano ("ahora", "anoche", "desde hace un mes"). */
  @Column('varchar', { length: 120, nullable: true })
  cuando: string | null;

  @Column('boolean')
  enCurso: boolean;

  @Column('varchar', { length: 6 })
  prioridad: Prioridad;

  @Column('int')
  puntaje: number;

  /** Por qué tiene esa prioridad (reglas que se cumplieron). */
  @Column('jsonb', { default: () => `'[]'` })
  motivosPrioridad: string[];

  /** Peligro para personas: el agente le dijo que llamara al 123. */
  @Column('boolean', { default: false })
  emergencia: boolean;

  @Column('varchar', { length: 250 })
  entidad: string;

  @Column('jsonb', { default: () => `'[]'` })
  canalesOficiales: string[];

  @Column('varchar', { length: 12, default: 'recibido' })
  estado: EstadoReporte;

  @Column('varchar', { length: 12 })
  canal: 'texto' | 'voz' | 'formulario';

  /** Datos de contacto opcionales (el reporte puede ser anónimo). */
  @Column('varchar', { length: 120, nullable: true })
  contacto: string | null;

  @Column({ type: 'vector', length: 768, nullable: true } as any)
  embedding: number[] | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadoEn: Date;

  @OneToMany(() => ReporteCiudadanoEvento, (e) => e.reporte)
  eventos: ReporteCiudadanoEvento[];

  @OneToMany(() => ReporteEvidencia, (e) => e.reporte)
  evidencias: ReporteEvidencia[];
}

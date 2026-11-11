import { Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ChatAdjunto } from './chatAdjunto.entity';
import { ReporteCiudadano } from './reporteCiudadano.entity';

/**
 * Evidencia de un reporte (foto, nota de voz o documento). El archivo vive en `ChatAdjunto` (bytea + texto: transcripción
 * o descripción de la imagen, indexado en pgvector), así que la evidencia también se puede buscar por significado.
 */
@Entity({ name: 'ReporteEvidencia' })
@Index(['reporte', 'adjunto'], { unique: true })
export class ReporteEvidencia {
  @PrimaryGeneratedColumn()
  reporteEvidenciaId: number;

  @ManyToOne(() => ReporteCiudadano, (r) => r.evidencias, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporteCiudadanoId' })
  reporte: ReporteCiudadano;

  @ManyToOne(() => ChatAdjunto, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chatAdjuntoId' })
  adjunto: ChatAdjunto;
}

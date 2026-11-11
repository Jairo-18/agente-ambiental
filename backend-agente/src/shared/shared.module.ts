import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdvertenciaQaqc } from './entities/advertenciaQaqc.entity';
import { ChatAdjunto } from './entities/chatAdjunto.entity';
import { ChatConversacion } from './entities/chatConversacion.entity';
import { ChatFragmento } from './entities/chatFragmento.entity';
import { ChatMensaje } from './entities/chatMensaje.entity';
import { ConsultaNorma } from './entities/consultaNorma.entity';
import { Conversacion } from './entities/conversacion.entity';
import { Evaluacion } from './entities/evaluacion.entity';
import { Excedencia } from './entities/excedencia.entity';
import { Mensaje } from './entities/mensaje.entity';
import { NormaFragmento } from './entities/normaFragmento.entity';
import { Reporte } from './entities/reporte.entity';
import { ReporteCiudadano } from './entities/reporteCiudadano.entity';
import { ReporteCiudadanoEvento } from './entities/reporteCiudadanoEvento.entity';
import { ReporteEvidencia } from './entities/reporteEvidencia.entity';
import { Serie } from './entities/serie.entity';
import { ChatAdjuntoRepository } from './repositories/chatAdjunto.repository';
import { ChatConversacionRepository } from './repositories/chatConversacion.repository';
import { ChatFragmentoRepository } from './repositories/chatFragmento.repository';
import { ChatMensajeRepository } from './repositories/chatMensaje.repository';
import { ConsultaNormaRepository } from './repositories/consultaNorma.repository';
import { ConversacionRepository } from './repositories/conversacion.repository';
import { EvaluacionRepository } from './repositories/evaluacion.repository';
import { MensajeRepository } from './repositories/mensaje.repository';
import { NormaFragmentoRepository } from './repositories/normaFragmento.repository';
import { ReporteRepository } from './repositories/reporte.repository';
import { ReporteCiudadanoRepository } from './repositories/reporteCiudadano.repository';

export const ENTIDADES = [Reporte, Excedencia, Serie, AdvertenciaQaqc, Evaluacion, Conversacion, Mensaje, NormaFragmento, ConsultaNorma, ChatConversacion, ChatMensaje, ChatAdjunto, ChatFragmento,
  ReporteCiudadano, ReporteCiudadanoEvento, ReporteEvidencia,
];

const REPOSITORIOS = [
  ReporteRepository,
  EvaluacionRepository,
  ConversacionRepository,
  MensajeRepository,
  NormaFragmentoRepository,
  ConsultaNormaRepository,
  ChatConversacionRepository,
  ChatMensajeRepository,
  ChatAdjuntoRepository,
  ChatFragmentoRepository,
  ReporteCiudadanoRepository,
];

/** Entidades y repositorios TypeORM compartidos por los módulos de negocio. */
@Module({
  imports: [TypeOrmModule.forFeature(ENTIDADES)],
  providers: REPOSITORIOS,
  exports: [TypeOrmModule, ...REPOSITORIOS],
})
export class SharedModule {}

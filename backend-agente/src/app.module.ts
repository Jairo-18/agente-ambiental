import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalisisModule } from './analisis/analisis.module';
import { ArranqueService } from './arranque.service';
import { AsistenteModule } from './asistente/asistente.module';
import { ChatModule } from './chat/chat.module';
import { configuration } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { ConocimientoModule } from './conocimiento/conocimiento.module';
import { DatosModule } from './datos/datos.module';
import { typeOrmOptions } from './database/database.config';
import { EvaluacionesModule } from './evaluaciones/evaluaciones.module';
import { LlmModule } from './llm/llm.module';
import { NormaModule } from './norma/norma.module';
import { NormativaModule } from './normativa/normativa.module';
import { RedaccionModule } from './redaccion/redaccion.module';
import { ReportesModule } from './reportes/reportes.module';
import { ReportesCiudadanosModule } from './reportes-ciudadanos/reportes-ciudadanos.module';
import { SaludModule } from './salud/salud.module';
import { SharedModule } from './shared/shared.module';
import { TrabajosModule } from './trabajos/trabajos.module';
import { VozModule } from './voz/voz.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnv, envFilePath: '.env' }),
    TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: typeOrmOptions }),
    SharedModule,
    // el dominio: la base de conocimiento, la norma y el análisis de datos
    ConocimientoModule,
    NormativaModule,
    DatosModule,
    AnalisisModule,
    // el lenguaje: el modelo local y los textos que escribe (bajo verificación)
    LlmModule,
    RedaccionModule,
    // las funciones del sistema
    TrabajosModule,
    ReportesModule,
    ReportesCiudadanosModule,
    EvaluacionesModule,
    NormaModule,
    AsistenteModule,
    ChatModule,
    VozModule,
    SaludModule,
  ],
  providers: [ArranqueService],
})
export class AppModule {}

import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  const { port, host, corsOrigins } = config.get('app', { infer: true });

  app.setGlobalPrefix('api');
  app.use(helmet({ contentSecurityPolicy: false })); // Swagger carga sus propios scripts
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  // El navegador llega por el proxy de Next.js; el acceso directo solo se admite desde el front local.
  app.enableCors({ origin: corsOrigins, methods: ['GET', 'POST', 'DELETE'] });

  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Agente de reportes ambientales')
        .setDescription('Reportes mensuales de calidad del aire de Bogotá: motor de reglas, QA/QC, trazabilidad, PostgreSQL y pgvector')
        .setVersion('2.0')
        .build(),
    ),
  );

  await app.listen(port, host);
  new Logger('Main').log(`API en http://${host}:${port}/api · documentación en /docs`);
}

bootstrap();

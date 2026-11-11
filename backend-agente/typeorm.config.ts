import 'reflect-metadata';
import { config as cargarEnv } from 'dotenv';
import { DataSource } from 'typeorm';

cargarEnv();

/** DataSource para la CLI de TypeORM (generar y correr migraciones). La aplicación usa `database.config.ts`. */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 5433),
  username: process.env.DB_USERNAME ?? 'agente',
  password: process.env.DB_PASSWORD ?? 'agente_local',
  database: process.env.DB_DATABASE ?? 'agente_ambiental',
  entities: [`${__dirname}/src/shared/entities/*.entity.{ts,js}`],
  migrations: [`${__dirname}/src/database/migrations/*.{ts,js}`],
  synchronize: false,
  uuidExtension: 'pgcrypto', // gen_random_uuid(): no hace falta uuid-ossp
});

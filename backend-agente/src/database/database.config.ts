import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';

/**
 * Conexión de la aplicación. `synchronize` está apagado a propósito: el esquema lo manejan las migraciones
 * (`src/database/migrations`), que se aplican al arrancar. El mismo esquema se declara en las entidades.
 */
export function typeOrmOptions(config: ConfigService<AppConfig, true>): TypeOrmModuleOptions {
  const db = config.get('db', { infer: true });
  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.username,
    password: db.password,
    database: db.database,
    autoLoadEntities: true,
    synchronize: false,
    uuidExtension: 'pgcrypto', // gen_random_uuid(): no hace falta uuid-ossp
    migrationsRun: true,
    migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
    logging: ['error', 'warn'],
    extra: { max: 10 },
  };
}

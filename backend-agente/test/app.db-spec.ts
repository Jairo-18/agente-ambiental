/**
 * Extremo a extremo: la aplicación completa (NestJS + TypeORM + migraciones) contra PostgreSQL + pgvector reales, en
 * una base aparte (`agente_test`, se recrea en cada corrida). Falsos: solo Ollama y la carpeta de salida (temporal).
 *
 *   docker compose up -d db      (desde la carpeta del proyecto)
 *   npm run test:db
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { carpetaTemporal, llamada, OllamaFalso } from './helpers/dobles';
import { CSV_OCTUBRE } from './helpers/servicios';

// el entorno se fija ANTES de cargar la aplicación: ConfigModule lo lee al importarse
const ADMIN = { host: '127.0.0.1', port: 5433, user: 'agente', password: 'agente_local', database: 'postgres' };
process.env.DB_HOST = ADMIN.host;
process.env.DB_PORT = String(ADMIN.port);
process.env.DB_USERNAME = ADMIN.user;
process.env.DB_PASSWORD = ADMIN.password;
process.env.DB_DATABASE = 'agente_test';
process.env.REPORTS_DIR = carpetaTemporal('e2e-reportes-');
process.env.SIMILARITY_MIN = '0.05'; // los embeddings falsos (bolsa de palabras) se parecen menos que los reales

/* eslint-disable @typescript-eslint/no-require-imports */
const { AppModule } = require('../src/app.module');
const { FragmentosService } = require('../src/conocimiento/services/fragmentos.service');
const { ArranqueService } = require('../src/arranque.service');
const { OllamaService } = require('../src/llm/services/ollama.service');

const GENERAR = { archivo: CSV_OCTUBRE, periodo: '2026-10', conLlm: false };

describe('Aplicación completa (PostgreSQL + pgvector reales)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let ollama: OllamaFalso;
  let ds: DataSource;

  beforeAll(async () => {
    const admin = new Client(ADMIN);
    await admin.connect();
    await admin.query('DROP DATABASE IF EXISTS agente_test WITH (FORCE)');
    await admin.query('CREATE DATABASE agente_test');
    await admin.end();

    ollama = new OllamaFalso();
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OllamaService).useValue(ollama)
      .overrideProvider(ArranqueService).useValue({ onApplicationBootstrap: () => undefined })
      .compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    http = request(app.getHttpServer());
    ds = app.get(DataSource);
  }, 120000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    ollama.respuestas = []; // que una prueba no consuma las respuestas guionadas de otra
  });

  /** Espera a que termine un trabajo en segundo plano y devuelve su estado final. */
  async function esperar(trabajoId: string) {
    for (let i = 0; i < 300; i++) {
      const t = (await http.get(`/api/trabajos/${trabajoId}`)).body;
      if (t.estado !== 'en_curso') return t;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('el trabajo no terminó');
  }

  describe('base de datos', () => {
    it('las migraciones crearon el esquema y pgvector está activo', async () => {
      const tablas = (await ds.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).map((t: { table_name: string }) => t.table_name);
      expect(tablas).toEqual(expect.arrayContaining(['Reporte', 'Excedencia', 'Serie', 'AdvertenciaQaqc', 'Evaluacion', 'Conversacion', 'Mensaje', 'NormaFragmento', 'ConsultaNorma', 'migrations']));
      const [{ extversion }] = await ds.query(`SELECT extversion FROM pg_extension WHERE extname = 'vector'`);
      expect(extversion).toMatch(/^0\./);
    });

    it('las entidades coinciden con la migración: lo único que TypeORM no entiende son los índices HNSW hechos a mano', async () => {
      const { upQueries } = await ds.driver.createSchemaBuilder().log();
      expect(upQueries.map((q) => q.query).sort()).toEqual([
        `DROP INDEX "public"."IDX_ChatFragmento_embedding_hnsw"`,
        `DROP INDEX "public"."IDX_NormaFragmento_embedding_hnsw"`,
        `DROP INDEX "public"."IDX_ReporteCiudadano_embedding_hnsw"`,
      ]);
    });

    it('los índices HNSW de coseno sobre los vectores existen (norma y memoria del chat)', async () => {
      for (const nombre of ['IDX_NormaFragmento_embedding_hnsw', 'IDX_ChatFragmento_embedding_hnsw', 'IDX_ReporteCiudadano_embedding_hnsw']) {
        const [i] = await ds.query(`SELECT indexdef FROM pg_indexes WHERE indexname = $1`, [nombre]);
        expect(i.indexdef).toContain('hnsw');
        expect(i.indexdef).toContain('vector_cosine_ops');
      }
    });

    it('volver a correr las migraciones no hace nada', async () => {
      expect(await ds.runMigrations()).toEqual([]);
    });

    it('un periodo con formato inválido es rechazado por la propia base (CHECK)', async () => {
      await expect(ds.query(`INSERT INTO "Reporte" ("periodo","archivoDatos","carpeta","resumen","detalle") VALUES ('2026-13','a','b','c','{}')`)).rejects.toThrow(/check/i);
    });
  });

  describe('API', () => {
    it('salud: backend, base con pgvector y Ollama', async () => {
      const r = (await http.get('/api/salud').expect(200)).body;
      expect(r.backend.activo).toBe(true);
      expect(r.baseDeDatos).toMatchObject({ activo: true, fragmentosNorma: 0, reportes: 0 });
      expect(r.baseDeDatos.pgvector).toMatch(/^0\./);
      expect(r.ollama.activo).toBe(true);
    });

    it('lista los archivos de datos', async () => {
      const r = (await http.get('/api/datos').expect(200)).body;
      expect(r.find((a: { archivo: string }) => a.archivo === CSV_OCTUBRE)).toMatchObject({ estaciones: ['Guaymaral', 'Kennedy', 'Puente Aranda'] });
    });

    it('revisar: QA/QC de octubre sin escribir nada', async () => {
      const r = (await http.post('/api/reportes/revisar').send({ archivo: CSV_OCTUBRE, periodo: '2026-10' }).expect(201)).body;
      expect(r).toMatchObject({ horas_esperadas: 744, n_advertencias_por_severidad: { error: 0, aviso: 8, info: 2 } });
      expect((await http.get('/api/reportes')).body).toEqual([]);
    });

    it('valida las entradas: periodo, campos desconocidos y archivos fuera de la carpeta de datos', async () => {
      const malo = (await http.post('/api/reportes/revisar').send({ archivo: CSV_OCTUBRE, periodo: '2026-13' }).expect(400)).body;
      expect(JSON.stringify(malo.message)).toContain('AAAA-MM');
      await http.post('/api/reportes/revisar').send({ archivo: CSV_OCTUBRE, periodo: '2026-10', extra: 1 }).expect(400);
      await http.post('/api/reportes/revisar').send({ archivo: '../secreto.csv', periodo: '2026-10' }).expect(404);
      await http.post('/api/reportes/revisar').send({ archivo: CSV_OCTUBRE, periodo: '2026-09' }).expect(400);
    });

    it('generar: 202 con un trabajo, queda en disco y en la base', async () => {
      const r = await http.post('/api/reportes/generar').send(GENERAR).expect(202);
      const t = await esperar(r.body.trabajoId);
      expect(t.estado).toBe('listo');
      expect(t.resultado).toMatchObject({ generado: true, periodo: '2026-10', carpeta: 'reports/2026-10_aire' });
      expect(t.resultado.excedencias.map((e: { contaminante: string }) => e.contaminante)).toEqual(['PM10', 'PM2.5']);

      const [{ n }] = await ds.query(`SELECT (SELECT count(*)::int FROM "Excedencia") + (SELECT count(*)::int FROM "Serie") + (SELECT count(*)::int FROM "AdvertenciaQaqc") AS n`);
      expect(n).toBe(2 + 18 + 10 - 2 /* avisos y errores se guardan; las 2 de info no cuentan en el detalle */ + 0);
    }, 120000);

    it('el reporte y sus versiones salen de la base', async () => {
      const lista = (await http.get('/api/reportes').expect(200)).body;
      expect(lista).toHaveLength(1);
      expect(lista[0]).toMatchObject({ periodo: '2026-10', versiones: 1, n_excedencias: 2, origen: 'generado', con_llm: false });

      const r = (await http.get('/api/reportes/2026-10').expect(200)).body;
      expect(r.detalle).toMatchObject({ mes: 'octubre de 2026', estaciones: ['Guaymaral', 'Kennedy', 'Puente Aranda'] });
      expect(r.detalle.excedencias).toHaveLength(2);
      expect(r.detalle.no_evaluables).toHaveLength(2);
      expect(r.detalle.archivos).toEqual(expect.arrayContaining(['reporte.docx', 'trazabilidad.md', 'hechos.json']));
      expect((await http.get('/api/reportes/2026-10/versiones').expect(200)).body).toHaveLength(1);
      await http.get('/api/reportes/2025-01').expect(404);
      await http.get('/api/reportes/hoy').expect(400);
    });

    it('la analítica agrega entre reportes con SQL', async () => {
      const a = (await http.get('/api/analitica').expect(200)).body;
      expect(a.totales).toMatchObject({ reportes_guardados: 1, periodos: 1 });
      expect(a.excedencias.map((e: { estacion: string; contaminante: string }) => `${e.estacion}/${e.contaminante}`).sort()).toEqual(['Kennedy/PM10', 'Kennedy/PM2.5']);
      expect(a.noEvaluables.map((e: { estacion: string; contaminante: string }) => `${e.estacion}/${e.contaminante}`).sort()).toEqual(['Kennedy/O3', 'Puente Aranda/SO2']);
    });

    it('descarga el DOCX y los gráficos; nada fuera de la lista cerrada', async () => {
      const docx = await http.get('/api/reportes/2026-10/archivos/reporte.docx').buffer(true).parse((res, cb) => {
        const trozos: Buffer[] = [];
        res.on('data', (c: Buffer) => trozos.push(c));
        res.on('end', () => cb(null, Buffer.concat(trozos)));
      }).expect(200);
      expect(docx.headers['content-type']).toContain('wordprocessingml');
      expect(docx.headers['content-disposition']).toContain('attachment; filename="reporte.docx"');
      expect((docx.body as Buffer).subarray(0, 2).toString()).toBe('PK'); // un .docx es un zip
      expect((await http.get('/api/reportes/2026-10/archivos/pm10_diario.png').expect(200)).headers['content-type']).toBe('image/png');
      expect((await http.get('/api/reportes/2026-10/archivos/trazabilidad.md').expect(200)).text).toContain('# Trazabilidad — octubre de 2026');
      for (const n of ['secreto.txt', '..%2F..%2F.env', 'package.json']) await http.get(`/api/reportes/2026-10/archivos/${n}`).expect(404);
      await http.get('/api/reportes/2026-10/archivos/reporte.docx').set('Origin', 'http://127.0.0.1:3100').expect(200);
    });

    it('regenerar un mes pide confirmación y guarda una versión nueva', async () => {
      const pide = (await http.post('/api/reportes/generar').send(GENERAR).expect(201)).body;
      expect(pide).toMatchObject({ requiereConfirmacion: true });
      expect(pide.mensaje).toContain('octubre de 2026');
      const r = await http.post('/api/reportes/generar').send({ ...GENERAR, confirmado: true }).expect(202);
      expect((await esperar(r.body.trabajoId)).estado).toBe('listo');
      expect((await http.get('/api/reportes')).body[0]).toMatchObject({ versiones: 2 });
      expect((await http.get('/api/reportes/2026-10/versiones')).body).toHaveLength(2);
      expect((await http.get('/api/analitica')).body.excedencias).toHaveLength(2); // solo cuenta la versión vigente
    }, 120000);

    it('solo una operación pesada a la vez', async () => {
      const a = await http.post('/api/reportes/generar').send({ ...GENERAR, confirmado: true }).expect(202);
      const b = await http.post('/api/reportes/generar').send({ ...GENERAR, confirmado: true });
      expect(b.status).toBe(409);
      expect(b.body.message).toContain('otra operación en curso');
      await esperar(a.body.trabajoId);
    }, 120000);

    it('un trabajo desconocido es 404', async () => {
      await http.get('/api/trabajos/no-existe').expect(404);
    });

    it('evaluar un valor lo registra en la base', async () => {
      const r = (await http.post('/api/evaluaciones').send({ contaminante: 'PM2.5', promedio: '24h', valor: 41.29 }).expect(201)).body;
      expect(r).toMatchObject({ estado: 'excede', nivel_excepcional: 'prevencion', reglas: ['LIM-PM25-24H', 'NIV-PM25-24H-PREVENCION'] });
      const h = (await http.get('/api/evaluaciones?limite=5').expect(200)).body;
      expect(h[0]).toMatchObject({ contaminante: 'PM2.5', valor: 41.29, estado: 'excede', nivel: 'prevencion' });
      await http.post('/api/evaluaciones').send({ contaminante: 'H2S', promedio: '24h', valor: 1 }).expect(400);
      await http.post('/api/evaluaciones').send({ contaminante: 'CO', promedio: '1h', valor: 'x' }).expect(400);
      await http.post('/api/evaluaciones').send({ contaminante: 'PM10', promedio: '24h', valor: 10, unidad: 'ppb' }).expect(400);
    });
  });

  describe('norma (pgvector)', () => {
    it('con el índice vacío pide indexar', async () => {
      expect((await http.get('/api/norma/estado').expect(200)).body.fragmentos).toBe(0);
      await http.post('/api/norma/preguntar').send({ pregunta: '¿Cuál es el límite de PM10?' }).expect(409);
    });

    it('indexa los 68 fragmentos (aire + reportes ciudadanos) y es idempotente', async () => {
      expect((await http.post('/api/norma/indexar').expect(201)).body).toEqual({ indexados: 68 });
      await http.post('/api/norma/indexar').expect(201);
      expect((await http.get('/api/norma/estado').expect(200)).body).toMatchObject({ fragmentos: 68, modeloEmbeddings: 'embeddinggemma' });
      const [{ dim }] = await ds.query(`SELECT vector_dims("embedding") AS dim FROM "NormaFragmento" LIMIT 1`);
      expect(dim).toBe(768);
    });

    it('busca por cercanía: el fragmento idéntico a la consulta sale primero, con similitud coseno 1', async () => {
      // con los embeddings falsos solo un texto idéntico tiene un vecino inequívoco; con los reales (nomic) se comprobó a mano
      const f = (app.get(FragmentosService).construir() as { clave: string; titulo: string; texto: string }[]).find((x) => x.clave === 'CONV-O3')!;
      const r = (await http.get('/api/norma/buscar').query({ q: `${f.titulo}. ${f.texto}`, k: 3 }).expect(200)).body;
      expect(r.resultados[0].clave).toBe('CONV-O3');
      expect(r.resultados[0].similitud).toBeCloseTo(1, 5);
      expect(r.resultados).toHaveLength(3);
      expect(r.resultados[0].similitud).toBeGreaterThan(r.resultados[1].similitud);
      expect(r.resultados[1].similitud).toBeGreaterThanOrEqual(r.resultados[2].similitud);
      await http.get('/api/norma/buscar').expect(400);
    });

    it('responde con citas verificadas y deja el registro de la consulta', async () => {
      ollama.encolar('El límite de PM10 en 24 horas es 75 µg/m³ [LIM-PM10-24H].');
      const r = (await http.post('/api/norma/preguntar').send({ pregunta: '¿Cuál es el nivel máximo permisible de PM10 en 24 horas?' }).expect(201)).body;
      expect(r).toMatchObject({ origen: 'llm', intentos: 1 });
      expect(r.citas.map((c: { clave: string }) => c.clave)).toEqual(['LIM-PM10-24H']);
      const [c] = await ds.query(`SELECT "origen", "citas" FROM "ConsultaNorma" ORDER BY "consultaId" DESC LIMIT 1`);
      expect(c).toEqual({ origen: 'llm', citas: ['LIM-PM10-24H'] });
    });

    it('una respuesta con una cifra inventada se rechaza y gana el código', async () => {
      const mala = 'El límite es 999 µg/m³ [LIM-PM10-24H].';
      ollama.encolar(mala, mala, mala);
      const r = (await http.post('/api/norma/preguntar').send({ pregunta: '¿Cuál es el nivel máximo permisible de PM10 en 24 horas?' }).expect(201)).body;
      expect(r.origen).toBe('extractiva');
      expect(r.respuesta).not.toContain('999');
    });
  });

  describe('asistente', () => {
    it('un mensaje corre en segundo plano y la conversación queda guardada', async () => {
      ollama.encolar(llamada('evaluar_valor', { contaminante: 'PM10', promedio: '24h', valor: 80.24 }), 'Con 80.24 µg/m³ excede el límite de 75 µg/m³.');
      const r = await http.post('/api/asistente/mensajes').send({ mensaje: '¿80.24 de PM10 en 24 h cumple?' }).expect(202);
      const t = await esperar(r.body.trabajoId);
      expect(t.estado).toBe('listo');
      expect(t.resultado).toMatchObject({ origen: 'llm', respuesta: 'Con 80.24 µg/m³ excede el límite de 75 µg/m³.' });
      expect(t.resultado.llamadas).toEqual([{ herramienta: 'evaluar_valor', argumentos: { contaminante: 'PM10', promedio: '24h', valor: 80.24 }, error: null }]);

      const h = (await http.get('/api/asistente/historial').expect(200)).body;
      expect(h.mensajes.map((m: { rol: string }) => m.rol)).toEqual(['usuario', 'agente']);
      expect(h.mensajes[1].herramientas[0].herramienta).toBe('evaluar_valor');
    });

    it('sobrescribir pasa por una confirmación humana: con "no" no se genera otra versión', async () => {
      const antes = (await http.get('/api/reportes/2026-10/versiones')).body.length;
      ollama.encolar(llamada('generar_reporte', { archivo: CSV_OCTUBRE, periodo: '2026-10', con_llm: false }));
      const r = await http.post('/api/asistente/mensajes').send({ mensaje: 'hazme el reporte de octubre 2026' }).expect(202);

      let pendiente: { id: string; pregunta: string } | null = null;
      for (let i = 0; i < 100 && !pendiente; i++) {
        pendiente = (await http.get('/api/asistente/pendiente')).body.pendiente;
        if (!pendiente) await new Promise((x) => setTimeout(x, 100));
      }
      expect(pendiente!.pregunta).toContain('¿Lo sobrescribo?');
      await http.post('/api/asistente/confirmar').send({ id: 'otro', ok: true }).expect(404);
      await http.post('/api/asistente/confirmar').send({ id: pendiente!.id, ok: false }).expect(201);

      const t = await esperar(r.body.trabajoId);
      expect(t.resultado.respuesta).toBe('El usuario no confirmó sobrescribir el reporte existente.');
      expect((await http.get('/api/reportes/2026-10/versiones')).body).toHaveLength(antes);
      expect((await http.get('/api/asistente/pendiente')).body.pendiente).toBeNull();
    }, 60000);

    it('una conversación nueva empieza vacía', async () => {
      await http.post('/api/asistente/nueva').expect(201);
      expect((await http.get('/api/asistente/historial')).body.mensajes).toEqual([]);
      await http.post('/api/asistente/mensajes').send({ mensaje: '' }).expect(400);
    });
  });
});

import { MigrationInterface, QueryRunner } from "typeorm";

export class EsquemaInicial1794262617877 implements MigrationInterface {
    name = 'EsquemaInicial1794262617877'

    /**
     * Esquema inicial (generado con `migration:generate` y completado a mano en dos puntos):
     *  - las extensiones `vector` (pgvector) y `pgcrypto` (gen_random_uuid) se piden de forma explícita;
     *  - el índice HNSW de coseno sobre NormaFragmento.embedding, que TypeORM no sabe describir.
     */
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "vector"`);
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
        await queryRunner.query(`CREATE TABLE "Excedencia" ("excedenciaId" SERIAL NOT NULL, "estacion" character varying(100) NOT NULL, "contaminante" character varying(10) NOT NULL, "promedio" character varying(5) NOT NULL, "fechaHora" character varying(20) NOT NULL, "valorUgm3" double precision NOT NULL, "limiteUgm3" double precision NOT NULL, "reglaId" character varying(50) NOT NULL, "reporteId" integer NOT NULL, CONSTRAINT "PK_983ce9c924fb4823509ad8ca6d4" PRIMARY KEY ("excedenciaId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_2f39e62c0d1bdcfe1696c6b908" ON "Excedencia"  ("reporteId") `);
        await queryRunner.query(`CREATE TABLE "Serie" ("serieId" SERIAL NOT NULL, "estacion" character varying(100) NOT NULL, "contaminante" character varying(10) NOT NULL, "representatividadPct" double precision NOT NULL, "evaluable" boolean NOT NULL, "mediaUgm3" double precision, "nExcedencias" integer NOT NULL DEFAULT '0', "reporteId" integer NOT NULL, CONSTRAINT "PK_0e6ed4ef8c0627196730cdf1fd2" PRIMARY KEY ("serieId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f5c30b920c150b2fceb82e35cf" ON "Serie"  ("reporteId") `);
        await queryRunner.query(`CREATE TABLE "Reporte" ("reporteId" SERIAL NOT NULL, "periodo" character varying(7) NOT NULL, "archivoDatos" character varying(255) NOT NULL, "conLlm" boolean, "origen" character varying(20) NOT NULL DEFAULT 'generado', "generadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "carpeta" character varying(255) NOT NULL, "resumen" text NOT NULL, "redaccion" jsonb NOT NULL DEFAULT '{}', "detalle" jsonb NOT NULL, "nExcedencias" integer NOT NULL DEFAULT '0', CONSTRAINT "CHK_550beb389444948a0f0e79d6e3" CHECK ("periodo" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), CONSTRAINT "PK_a0a8cd40cc5ed7e8a8ab8c27278" PRIMARY KEY ("reporteId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5dace779787d858433b267d4ed" ON "Reporte"  ("periodo", "generadoEn") `);
        await queryRunner.query(`CREATE TABLE "AdvertenciaQaqc" ("advertenciaId" SERIAL NOT NULL, "codigo" character varying(40) NOT NULL, "severidad" character varying(10) NOT NULL, "mensaje" text NOT NULL, "estacion" character varying(100), "variable" character varying(100), "cantidad" integer, "reporteId" integer NOT NULL, CONSTRAINT "PK_3d3113b0df48fb53252cb48e63f" PRIMARY KEY ("advertenciaId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6bb4f15d60863cabfad93b1346" ON "AdvertenciaQaqc"  ("reporteId") `);
        await queryRunner.query(`CREATE TABLE "ConsultaNorma" ("consultaId" SERIAL NOT NULL, "pregunta" text NOT NULL, "respuesta" text NOT NULL, "origen" character varying(20) NOT NULL, "citas" jsonb NOT NULL DEFAULT '[]', "intentos" integer NOT NULL DEFAULT '0', "creadaEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7644dc8447964dc8d7480190ff2" PRIMARY KEY ("consultaId"))`);
        await queryRunner.query(`CREATE TABLE "Mensaje" ("mensajeId" SERIAL NOT NULL, "rol" character varying(10) NOT NULL, "contenido" text NOT NULL, "herramientas" jsonb NOT NULL DEFAULT '[]', "origen" character varying(20), "creadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "conversacionId" uuid NOT NULL, CONSTRAINT "CHK_36c759361c3922cfd93d403bf6" CHECK ("rol" IN ('usuario', 'agente')), CONSTRAINT "PK_bac18d7b72e8d7a68f965588648" PRIMARY KEY ("mensajeId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3a63168461bf6b95332475941e" ON "Mensaje"  ("conversacionId", "mensajeId") `);
        await queryRunner.query(`CREATE TABLE "Conversacion" ("conversacionId" uuid NOT NULL DEFAULT gen_random_uuid(), "creadaEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ebd69e2f708e242049ba07fa0b1" PRIMARY KEY ("conversacionId"))`);
        await queryRunner.query(`CREATE TABLE "Evaluacion" ("evaluacionId" SERIAL NOT NULL, "contaminante" character varying(10) NOT NULL, "promedio" character varying(5) NOT NULL, "valor" double precision NOT NULL, "unidad" character varying(10) NOT NULL, "estado" character varying(20) NOT NULL, "nivel" character varying(20), "conclusion" text NOT NULL, "reglas" jsonb NOT NULL DEFAULT '[]', "fuentes" jsonb NOT NULL DEFAULT '[]', "creadaEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b92038ec019297030f04cac1831" PRIMARY KEY ("evaluacionId"))`);
        await queryRunner.query(`CREATE TABLE "NormaFragmento" ("clave" character varying(60) NOT NULL, "tipo" character varying(20) NOT NULL, "titulo" character varying(200) NOT NULL, "texto" text NOT NULL, "fuente" character varying(200) NOT NULL, "verificado" boolean NOT NULL, "embedding" vector(768) NOT NULL, "indexadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c891b43a4c4a5d36aaef5d854ae" PRIMARY KEY ("clave"))`);
        await queryRunner.query(`ALTER TABLE "Excedencia" ADD CONSTRAINT "FK_2f39e62c0d1bdcfe1696c6b908e" FOREIGN KEY ("reporteId") REFERENCES "Reporte"("reporteId") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "Serie" ADD CONSTRAINT "FK_f5c30b920c150b2fceb82e35cf4" FOREIGN KEY ("reporteId") REFERENCES "Reporte"("reporteId") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "AdvertenciaQaqc" ADD CONSTRAINT "FK_6bb4f15d60863cabfad93b13467" FOREIGN KEY ("reporteId") REFERENCES "Reporte"("reporteId") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "Mensaje" ADD CONSTRAINT "FK_6cb6e951c8785151401a3406ad8" FOREIGN KEY ("conversacionId") REFERENCES "Conversacion"("conversacionId") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE INDEX "IDX_NormaFragmento_embedding_hnsw" ON "NormaFragmento" USING hnsw ("embedding" vector_cosine_ops)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_NormaFragmento_embedding_hnsw"`);
        await queryRunner.query(`ALTER TABLE "Mensaje" DROP CONSTRAINT "FK_6cb6e951c8785151401a3406ad8"`);
        await queryRunner.query(`ALTER TABLE "AdvertenciaQaqc" DROP CONSTRAINT "FK_6bb4f15d60863cabfad93b13467"`);
        await queryRunner.query(`ALTER TABLE "Serie" DROP CONSTRAINT "FK_f5c30b920c150b2fceb82e35cf4"`);
        await queryRunner.query(`ALTER TABLE "Excedencia" DROP CONSTRAINT "FK_2f39e62c0d1bdcfe1696c6b908e"`);
        await queryRunner.query(`DROP TABLE "NormaFragmento"`);
        await queryRunner.query(`DROP TABLE "Evaluacion"`);
        await queryRunner.query(`DROP TABLE "Conversacion"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3a63168461bf6b95332475941e"`);
        await queryRunner.query(`DROP TABLE "Mensaje"`);
        await queryRunner.query(`DROP TABLE "ConsultaNorma"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6bb4f15d60863cabfad93b1346"`);
        await queryRunner.query(`DROP TABLE "AdvertenciaQaqc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5dace779787d858433b267d4ed"`);
        await queryRunner.query(`DROP TABLE "Reporte"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f5c30b920c150b2fceb82e35cf"`);
        await queryRunner.query(`DROP TABLE "Serie"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2f39e62c0d1bdcfe1696c6b908"`);
        await queryRunner.query(`DROP TABLE "Excedencia"`);
    }

}

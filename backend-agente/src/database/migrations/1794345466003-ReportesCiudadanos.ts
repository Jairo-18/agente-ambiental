import { MigrationInterface, QueryRunner } from "typeorm";

/** Reportes ciudadanos ambientales (Bogotá): reporte, historial de estados, evidencias y vector de la descripción (HNSW). */
export class ReportesCiudadanos1794345466003 implements MigrationInterface {
    name = 'ReportesCiudadanos1794345466003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "ReporteCiudadanoEvento" ("reporteCiudadanoEventoId" SERIAL NOT NULL, "estado" character varying(12) NOT NULL, "nota" text, "autor" character varying(12) NOT NULL, "creadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "reporteCiudadanoId" integer NOT NULL, CONSTRAINT "CHK_e128835bf761e3d2815110e54a" CHECK ("autor" IN ('agente', 'funcionario', 'ciudadano', 'sistema')), CONSTRAINT "PK_8d90255a8e3fb7b35458350a711" PRIMARY KEY ("reporteCiudadanoEventoId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5820a56187d73274f43989f7a8" ON "ReporteCiudadanoEvento"  ("reporteCiudadanoId", "reporteCiudadanoEventoId") `);
        await queryRunner.query(`CREATE TABLE "ReporteEvidencia" ("reporteEvidenciaId" SERIAL NOT NULL, "reporteCiudadanoId" integer NOT NULL, "chatAdjuntoId" uuid NOT NULL, CONSTRAINT "PK_eb6ad00d74488d08d8b7ed6fdff" PRIMARY KEY ("reporteEvidenciaId"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_cac6a572690bd11553c229c2f4" ON "ReporteEvidencia"  ("reporteCiudadanoId", "chatAdjuntoId") `);
        await queryRunner.query(`CREATE TABLE "ReporteCiudadano" ("reporteCiudadanoId" SERIAL NOT NULL, "radicado" character varying(20), "tipo" character varying(12) NOT NULL, "tipoModelo" character varying(12), "tipoReglas" character varying(12) NOT NULL, "descripcion" text NOT NULL, "direccion" character varying(250) NOT NULL, "localidad" character varying(40), "barrio" character varying(80), "latitud" double precision, "longitud" double precision, "cuando" character varying(120), "enCurso" boolean NOT NULL, "prioridad" character varying(6) NOT NULL, "puntaje" integer NOT NULL, "motivosPrioridad" jsonb NOT NULL DEFAULT '[]', "emergencia" boolean NOT NULL DEFAULT false, "entidad" character varying(250) NOT NULL, "canalesOficiales" jsonb NOT NULL DEFAULT '[]', "estado" character varying(12) NOT NULL DEFAULT 'recibido', "canal" character varying(12) NOT NULL, "contacto" character varying(120), "embedding" vector(768), "creadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_92d37cffeb6d47b10168d3a27c" CHECK ("canal" IN ('texto', 'voz', 'formulario')), CONSTRAINT "CHK_4fc203f8b0f1c14debb4638a48" CHECK ("estado" IN ('recibido', 'en_revision', 'remitido', 'cerrado')), CONSTRAINT "CHK_7c053de40ab35c23bd77bf69fd" CHECK ("prioridad" IN ('alta', 'media', 'baja')), CONSTRAINT "CHK_cd6000ba82bb1848075de63153" CHECK ("tipo" IN ('residuos', 'arbolado', 'quema', 'ruido', 'aire', 'agua', 'otro')), CONSTRAINT "PK_f72487b03f6b8c2d5556bff26bb" PRIMARY KEY ("reporteCiudadanoId"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_09a3e77c196e3985c38ce51e9b" ON "ReporteCiudadano"  ("radicado") `);
        await queryRunner.query(`CREATE INDEX "IDX_69bdaa52af5d2aa7234f9b5c59" ON "ReporteCiudadano"  ("creadoEn") `);
        await queryRunner.query(`CREATE INDEX "IDX_bd66862814061e58eebe26120a" ON "ReporteCiudadano"  ("estado", "prioridad") `);
        await queryRunner.query(`ALTER TABLE "ReporteCiudadanoEvento" ADD CONSTRAINT "FK_bf1aaf1fbab5ac5244404a4be38" FOREIGN KEY ("reporteCiudadanoId") REFERENCES "ReporteCiudadano"("reporteCiudadanoId") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ReporteEvidencia" ADD CONSTRAINT "FK_54e56f20cccb651e3fcc861ed26" FOREIGN KEY ("reporteCiudadanoId") REFERENCES "ReporteCiudadano"("reporteCiudadanoId") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ReporteEvidencia" ADD CONSTRAINT "FK_98debef7f6061f363a7833418c5" FOREIGN KEY ("chatAdjuntoId") REFERENCES "ChatAdjunto"("chatAdjuntoId") ON DELETE CASCADE ON UPDATE NO ACTION`);
        // a mano (TypeORM no sabe describirlo): reportes parecidos por coseno, para detectar duplicados
        await queryRunner.query(`CREATE INDEX "IDX_ReporteCiudadano_embedding_hnsw" ON "ReporteCiudadano" USING hnsw ("embedding" vector_cosine_ops)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ReporteCiudadano_embedding_hnsw"`);
        await queryRunner.query(`ALTER TABLE "ReporteEvidencia" DROP CONSTRAINT "FK_98debef7f6061f363a7833418c5"`);
        await queryRunner.query(`ALTER TABLE "ReporteEvidencia" DROP CONSTRAINT "FK_54e56f20cccb651e3fcc861ed26"`);
        await queryRunner.query(`ALTER TABLE "ReporteCiudadanoEvento" DROP CONSTRAINT "FK_bf1aaf1fbab5ac5244404a4be38"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bd66862814061e58eebe26120a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_69bdaa52af5d2aa7234f9b5c59"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_09a3e77c196e3985c38ce51e9b"`);
        await queryRunner.query(`DROP TABLE "ReporteCiudadano"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cac6a572690bd11553c229c2f4"`);
        await queryRunner.query(`DROP TABLE "ReporteEvidencia"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5820a56187d73274f43989f7a8"`);
        await queryRunner.query(`DROP TABLE "ReporteCiudadanoEvento"`);
    }

}

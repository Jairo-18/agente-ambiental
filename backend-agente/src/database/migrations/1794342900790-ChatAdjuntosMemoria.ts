import { MigrationInterface, QueryRunner } from "typeorm";

/** Archivos del chat (bytea) y su memoria vectorial: fragmentos con vector(768) e índice HNSW de coseno. */
export class ChatAdjuntosMemoria1794342900790 implements MigrationInterface {
    name = 'ChatAdjuntosMemoria1794342900790'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "ChatFragmento" ("chatFragmentoId" SERIAL NOT NULL, "orden" integer NOT NULL, "texto" text NOT NULL, "embedding" vector(768) NOT NULL, "chatAdjuntoId" uuid NOT NULL, CONSTRAINT "PK_ee80d4be1806c32aca9bb3c575a" PRIMARY KEY ("chatFragmentoId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_fef73e0349fdbd2d826a091c11" ON "ChatFragmento"  ("chatAdjuntoId", "orden") `);
        await queryRunner.query(`CREATE TABLE "ChatAdjunto" ("chatAdjuntoId" uuid NOT NULL DEFAULT gen_random_uuid(), "tipo" character varying(12) NOT NULL, "nombre" character varying(255) NOT NULL, "mime" character varying(120) NOT NULL, "tamano" integer NOT NULL, "datos" bytea NOT NULL, "texto" text, "paginas" integer, "duracionSeg" real, "dictado" boolean NOT NULL DEFAULT false, "estado" character varying(12) NOT NULL DEFAULT 'listo', "error" text, "indexado" boolean NOT NULL DEFAULT false, "creadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "chatConversacionId" uuid, "chatMensajeId" integer, CONSTRAINT "CHK_98db437ff1e5c9dfc539f5a630" CHECK ("estado" IN ('procesando', 'listo', 'error')), CONSTRAINT "CHK_eb055484def879230d4b2daf9a" CHECK ("tipo" IN ('documento', 'imagen', 'audio')), CONSTRAINT "PK_8d34fbbfca35ce4e55f551c46b4" PRIMARY KEY ("chatAdjuntoId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_8d3f5f85bf245e361f4c94f366" ON "ChatAdjunto"  ("chatConversacionId") `);
        await queryRunner.query(`CREATE INDEX "IDX_fbd6c99cb532cb5742f8ba5853" ON "ChatAdjunto"  ("chatMensajeId") `);
        await queryRunner.query(`ALTER TABLE "ChatFragmento" ADD CONSTRAINT "FK_c3a5d8a811769e6479ac9591a2d" FOREIGN KEY ("chatAdjuntoId") REFERENCES "ChatAdjunto"("chatAdjuntoId") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ChatAdjunto" ADD CONSTRAINT "FK_8d3f5f85bf245e361f4c94f3664" FOREIGN KEY ("chatConversacionId") REFERENCES "ChatConversacion"("chatConversacionId") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ChatAdjunto" ADD CONSTRAINT "FK_fbd6c99cb532cb5742f8ba58538" FOREIGN KEY ("chatMensajeId") REFERENCES "ChatMensaje"("chatMensajeId") ON DELETE CASCADE ON UPDATE NO ACTION`);
        // a mano (TypeORM no sabe describirlo): búsqueda por coseno en la memoria vectorial del chat
        await queryRunner.query(`CREATE INDEX "IDX_ChatFragmento_embedding_hnsw" ON "ChatFragmento" USING hnsw ("embedding" vector_cosine_ops)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ChatFragmento_embedding_hnsw"`);
        await queryRunner.query(`ALTER TABLE "ChatAdjunto" DROP CONSTRAINT "FK_fbd6c99cb532cb5742f8ba58538"`);
        await queryRunner.query(`ALTER TABLE "ChatAdjunto" DROP CONSTRAINT "FK_8d3f5f85bf245e361f4c94f3664"`);
        await queryRunner.query(`ALTER TABLE "ChatFragmento" DROP CONSTRAINT "FK_c3a5d8a811769e6479ac9591a2d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fbd6c99cb532cb5742f8ba5853"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8d3f5f85bf245e361f4c94f366"`);
        await queryRunner.query(`DROP TABLE "ChatAdjunto"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fef73e0349fdbd2d826a091c11"`);
        await queryRunner.query(`DROP TABLE "ChatFragmento"`);
    }

}

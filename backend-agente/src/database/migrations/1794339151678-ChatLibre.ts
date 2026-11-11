import { MigrationInterface, QueryRunner } from "typeorm";

/** Chat libre (Ollama, DeepSeek, Claude): sus conversaciones y mensajes, aparte de los del agente. */
export class ChatLibre1794339151678 implements MigrationInterface {
    name = 'ChatLibre1794339151678'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "ChatMensaje" ("chatMensajeId" SERIAL NOT NULL, "rol" character varying(10) NOT NULL, "contenido" text NOT NULL, "razonamiento" text, "proveedor" character varying(20) NOT NULL, "modelo" character varying(120) NOT NULL, "duracionMs" integer, "error" text, "creadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "chatConversacionId" uuid NOT NULL, CONSTRAINT "CHK_52ab3c77410905d91bf25b1aa7" CHECK ("rol" IN ('usuario', 'asistente')), CONSTRAINT "PK_b4a910773086147472e40786ca2" PRIMARY KEY ("chatMensajeId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1fa7cee65c57657bc5d8348d1b" ON "ChatMensaje"  ("chatConversacionId", "chatMensajeId") `);
        await queryRunner.query(`CREATE TABLE "ChatConversacion" ("chatConversacionId" uuid NOT NULL DEFAULT gen_random_uuid(), "titulo" character varying(120) NOT NULL, "proveedor" character varying(20) NOT NULL, "modelo" character varying(120) NOT NULL, "creadaEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizadaEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_71df12b9d28912eaa19ca9cef66" PRIMARY KEY ("chatConversacionId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_86006bd332f2986e8b541109a1" ON "ChatConversacion"  ("actualizadaEn") `);
        await queryRunner.query(`ALTER TABLE "ChatMensaje" ADD CONSTRAINT "FK_89bcc1d1677c408a56cf254fd71" FOREIGN KEY ("chatConversacionId") REFERENCES "ChatConversacion"("chatConversacionId") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ChatMensaje" DROP CONSTRAINT "FK_89bcc1d1677c408a56cf254fd71"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_86006bd332f2986e8b541109a1"`);
        await queryRunner.query(`DROP TABLE "ChatConversacion"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1fa7cee65c57657bc5d8348d1b"`);
        await queryRunner.query(`DROP TABLE "ChatMensaje"`);
    }

}

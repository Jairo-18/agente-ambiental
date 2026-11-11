import { MigrationInterface, QueryRunner } from "typeorm";

/** Nivel de esfuerzo ("capacidad") con que respondió cada mensaje del chat libre. */
export class ChatEsfuerzo1794340879322 implements MigrationInterface {
    name = 'ChatEsfuerzo1794340879322'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ChatMensaje" ADD "esfuerzo" character varying(10)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ChatMensaje" DROP COLUMN "esfuerzo"`);
    }

}

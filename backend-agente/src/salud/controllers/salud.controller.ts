import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppConfig } from '../../config/configuration';
import { OllamaService } from '../../llm/services/ollama.service';

@Controller('salud')
@ApiTags('Salud')
export class SaludController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ollama: OllamaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Qué piezas están en pie. Nunca falla: dice qué falta para que la interfaz lo muestre. */
  @Get()
  @ApiOperation({ summary: 'Estado del backend, la base de datos (con pgvector) y Ollama' })
  async salud() {
    const cfg = this.config.get('ollama', { infer: true });
    const [ollama, bd] = await Promise.all([
      this.ollama.disponible(),
      this.dataSource
        .query(
          `SELECT (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS "version",
                  (SELECT count(*)::int FROM "NormaFragmento") AS "fragmentos",
                  (SELECT count(*)::int FROM "Reporte") AS "reportes"`,
        )
        .then(
          ([f]) => ({ activo: true, pgvector: (f.version as string) ?? null, fragmentosNorma: f.fragmentos as number, reportes: f.reportes as number }),
          (e: Error) => ({ activo: false, error: e.message }),
        ),
    ]);
    return {
      backend: { activo: true },
      baseDeDatos: bd,
      ollama: {
        ...ollama,
        modeloChat: cfg.chatModel,
        chatInstalado: ollama.modelos.includes(cfg.chatModel),
        modeloEmbeddings: cfg.embeddingModel,
        embeddingsInstalado: ollama.modelos.some((m) => m.startsWith(cfg.embeddingModel)),
      },
    };
  }
}

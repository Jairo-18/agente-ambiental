import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { MemoriaService } from './chat/services/memoria.service';
import { NormaService } from './norma/services/norma.service';
import { ReportesCiudadanosService } from './reportes-ciudadanos/services/reportes-ciudadanos.service';
import { ReportesService } from './reportes/services/reportes.service';

/**
 * Al arrancar, sin bloquear: importa a la base los reportes que ya haya en disco y reindexa la norma si hace falta
 * (índice vacío, base de conocimiento editada o modelo de embeddings distinto). Si cambió el modelo, también se
 * recalculan los vectores de la memoria del chat y de los reportes ciudadanos. Si Ollama aún no está en pie, solo se
 * avisa en el registro; la interfaz ofrece el botón "Reindexar".
 */
@Injectable()
export class ArranqueService implements OnApplicationBootstrap {
  private readonly log = new Logger('Arranque');

  constructor(
    private readonly reportes: ReportesService,
    private readonly norma: NormaService,
    private readonly memoria: MemoriaService,
    private readonly ciudadanos: ReportesCiudadanosService,
  ) {}

  onApplicationBootstrap() {
    setTimeout(async () => {
      await this.reportes.sincronizar().catch((e: Error) => this.log.warn(`Sin importar reportes: ${e.message}`));
      try {
        const motivo = await this.norma.motivoParaReindexar();
        if (!motivo) return;
        this.log.log(`Reindexando la norma: ${motivo}`);
        await this.norma.indexar();
        if (motivo.startsWith('cambió el modelo')) {
          const m = await this.memoria.reindexarTodo();
          const r = await this.ciudadanos.reindexar();
          this.log.log(`Vectores recalculados: ${m.fragmentos} fragmentos de ${m.adjuntos} adjuntos del chat y ${r} reportes ciudadanos`);
        }
      } catch (e) {
        this.log.warn(`Norma sin indexar todavía: ${(e as Error).message}`);
      }
    }, 1500);
  }
}

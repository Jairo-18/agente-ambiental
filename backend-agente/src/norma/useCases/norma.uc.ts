import { BadRequestException, Injectable } from '@nestjs/common';
import { NormaService } from '../services/norma.service';

@Injectable()
export class NormaUC {
  constructor(private readonly norma: NormaService) {}

  estado() {
    return this.norma.estado();
  }

  indexar() {
    return this.norma.indexar();
  }

  async buscar(q: string | undefined, k: string | undefined) {
    if (!q || q.trim().length < 2) throw new BadRequestException('Falta la consulta (parámetro q).');
    const n = Math.min(Math.max(parseInt(k ?? '5', 10) || 5, 1), 10);
    return { consulta: q, resultados: await this.norma.buscar(q.trim(), n) };
  }

  preguntar(pregunta: string) {
    return this.norma.preguntar(pregunta.trim());
  }
}

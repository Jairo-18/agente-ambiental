import { Injectable } from '@nestjs/common';
import { MotorReglasService } from '../../normativa/services/motor-reglas.service';
import { EvaluacionRepository } from '../../shared/repositories/evaluacion.repository';
import { redondear2 } from '../../shared/utils/numeros.util';
import { EvaluarDto } from '../dtos/evaluaciones.dto';

@Injectable()
export class EvaluacionesService {
  constructor(
    private readonly reglas: MotorReglasService,
    private readonly repo: EvaluacionRepository,
  ) {}

  /** La evaluación la hace el motor de reglas (nunca el modelo); aquí solo se guarda como registro de auditoría. */
  async evaluar(dto: EvaluarDto) {
    const unidad = dto.unidad ?? 'µg/m3';
    const r = this.reglas.evaluar(dto.contaminante, dto.promedio, dto.valor, unidad);
    await this.repo.save(
      this.repo.create({
        contaminante: dto.contaminante, promedio: dto.promedio, valor: dto.valor, unidad, estado: r.estado,
        nivel: r.nivel_excepcional, conclusion: r.conclusion, reglas: r.reglas, fuentes: r.fuentes,
      }),
    );
    return {
      estado: r.estado, nivel_excepcional: r.nivel_excepcional, conclusion: r.conclusion, valor_ugm3: redondear2(r.valor_ugm3),
      reglas: r.reglas, fuentes: r.fuentes, explicacion: r.explicacion,
    };
  }

  async historial(limite: number) {
    return (await this.repo.ultimas(limite)).map((e) => ({
      id: e.evaluacionId, contaminante: e.contaminante, promedio: e.promedio, valor: e.valor, unidad: e.unidad,
      estado: e.estado, nivel: e.nivel, conclusion: e.conclusion, creada_en: e.creadaEn,
    }));
  }
}

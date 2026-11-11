import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Evaluacion } from '../entities/evaluacion.entity';

@Injectable()
export class EvaluacionRepository extends Repository<Evaluacion> {
  constructor(dataSource: DataSource) {
    super(Evaluacion, dataSource.createEntityManager());
  }

  ultimas(limite: number): Promise<Evaluacion[]> {
    return this.find({ order: { evaluacionId: 'DESC' }, take: limite });
  }
}

import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ConsultaNorma } from '../entities/consultaNorma.entity';

@Injectable()
export class ConsultaNormaRepository extends Repository<ConsultaNorma> {
  constructor(dataSource: DataSource) {
    super(ConsultaNorma, dataSource.createEntityManager());
  }
}

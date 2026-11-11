import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PreguntaDto } from '../dtos/norma.dto';
import { NormaUC } from '../useCases/norma.uc';

@Controller('norma')
@ApiTags('Norma (búsqueda vectorial)')
export class NormaController {
  constructor(private readonly uc: NormaUC) {}

  @Get('estado')
  @ApiOperation({ summary: 'Cuántos fragmentos de la norma hay indexados y cuándo se indexaron' })
  estado() {
    return this.uc.estado();
  }

  @Post('indexar')
  @ApiOperation({ summary: 'Vuelve a leer la base de conocimiento, calcula los embeddings y actualiza pgvector' })
  indexar() {
    return this.uc.indexar();
  }

  @Get('buscar')
  @ApiOperation({ summary: 'Los fragmentos de la norma más parecidos a la consulta (distancia coseno)' })
  buscar(@Query('q') q?: string, @Query('k') k?: string) {
    return this.uc.buscar(q, k);
  }

  @Post('preguntar')
  @ApiOperation({ summary: 'Responde con el modelo usando solo los fragmentos recuperados, con citas y cifras verificadas' })
  preguntar(@Body() dto: PreguntaDto) {
    return this.uc.preguntar(dto.pregunta);
  }
}

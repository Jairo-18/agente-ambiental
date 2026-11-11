import { IsString, MaxLength, MinLength } from 'class-validator';

export class PreguntaDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  pregunta!: string;
}

import { Injectable } from '@nestjs/common';
import { paraVerificador, rankings } from '../../analisis/hechos.util';
import { Hechos } from '../../analisis/interfaces/analisis.interface';
import { numerosPermitidos, verificar, verificarComparaciones } from '../../verificacion/verificador';
import {
  GUIA, MAX_INTENTOS_REDACCION, PROHIBIDAS, SECCIONES, SECCIONES_CON_LLM, SISTEMA_REDACTOR,
} from '../constants/redaccion.constants';
import { PlantillasService } from './plantillas.service';

/** Cómo se llama al modelo: un mensaje de sistema, uno de usuario, y el texto que devuelve. */
export type ClienteLlm = (sistema: string, usuario: string) => Promise<string>;

export interface Redaccion {
  seccion: string;
  texto: string;
  /** llm: el modelo redactó la parte descriptiva y pasó los verificadores · plantilla: la escribió el código */
  origen: 'llm' | 'plantilla';
  intentos: number;
  verificacion: Record<string, unknown>;
  problemas: string[];
}

/**
 * Redacción de las secciones interpretativas. Orden de confianza: el modelo solo ve datos ya calculados (nunca crudos),
 * su texto pasa por los verificadores y, si tras `MAX_INTENTOS_REDACCION` sigue fallando (o Ollama no responde), el
 * reporte usa el texto de plantilla. El modelo solo redacta la parte descriptiva; lo normativo lo agrega el código.
 */
@Injectable()
export class RedaccionService {
  constructor(private readonly plantillas: PlantillasService) {}

  secciones(): string[] {
    return Object.keys(SECCIONES);
  }

  async redactar(seccion: string, hechos: Hechos, llm: ClienteLlm | null = null, maxIntentos = MAX_INTENTOS_REDACCION): Promise<Redaccion> {
    const partes = this.plantillas.partes(seccion, hechos);
    const base = this.plantillas.ensamblar(partes);
    if (!llm || !(SECCIONES_CON_LLM as readonly string[]).includes(seccion)) {
      return { seccion, texto: base, origen: 'plantilla', intentos: 0, verificacion: {}, problemas: [] };
    }

    const cont = SECCIONES[seccion];
    const vista = this.plantillas.vistaDescriptiva(hechos, cont);
    const permitidos = numerosPermitidos(vista);
    const rank = paraVerificador(rankings(hechos, cont));
    const estaciones = Object.keys(hechos.estaciones);
    const pedido = `${GUIA[seccion]}\n\nHECHOS (JSON):\n${JSON.stringify(vista, null, 1)}`;
    const problemas: string[] = [];
    let prompt = pedido;

    for (let intento = 1; intento <= maxIntentos; intento++) {
      let texto: string;
      try {
        texto = await llm(SISTEMA_REDACTOR, prompt);
      } catch (e) {
        problemas.push(`intento ${intento}: el modelo falló (${(e as Error).name}: ${(e as Error).message})`); // Ollama caído, tiempo agotado...
        break;
      }
      const cifras = verificar(texto, permitidos);
      const comparacionesFalsas = verificarComparaciones(texto, rank, estaciones, [...(cont ?? hechos.meta.contaminantes)]);
      const prohibidas = [...new Set([...texto.matchAll(PROHIBIDAS)].map((m) => m[0].toLowerCase()))].sort();
      const ok = cifras.ok && !comparacionesFalsas.length && !prohibidas.length;
      if (ok) {
        return {
          seccion, texto: this.plantillas.ensamblar(partes, texto), origen: 'llm', intentos: intento,
          verificacion: { ...cifras, comparaciones_falsas: comparacionesFalsas, prohibidas, ok }, problemas,
        };
      }
      const f = (xs: string[]) => (xs.length ? JSON.stringify(xs) : 'ninguna');
      problemas.push(
        `intento ${intento}: cifras fuera de los hechos ${JSON.stringify(cifras.inventadas)}, comparaciones que no coinciden con el ranking ${JSON.stringify(comparacionesFalsas)}, palabras prohibidas ${JSON.stringify(prohibidas)}`,
      );
      prompt =
        `${pedido}\n\nTu intento anterior fue rechazado. Cifras que no están en los HECHOS: ${f(cifras.inventadas)}. ` +
        `Comparaciones incorrectas: ${f(comparacionesFalsas)}. Palabras que no puedes usar: ${f(prohibidas)}. ` +
        'Corrige usando solo cifras de los HECHOS, copiadas exactamente; compara estaciones solo con ranking_entre_estaciones ' +
        'y no hables de límites, excedencias, cumplimiento ni evaluabilidad.';
    }
    return { seccion, texto: base, origen: 'plantilla', intentos: problemas.length, verificacion: {}, problemas };
  }

  /** Todas las secciones del reporte. */
  async redactarTodas(hechos: Hechos, llm: ClienteLlm | null): Promise<Record<string, Redaccion>> {
    const out: Record<string, Redaccion> = {};
    for (const s of this.secciones()) out[s] = await this.redactar(s, hechos, llm);
    return out;
  }
}

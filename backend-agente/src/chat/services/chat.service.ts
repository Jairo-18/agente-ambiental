import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { Esfuerzo, EstadoProveedor, ModeloInfo, ProveedorChat, ProveedorId } from '../../llm/interfaces/chat.interface';
import { ClaudeCliService } from '../../llm/services/claude-cli.service';
import { DeepseekService } from '../../llm/services/deepseek.service';
import { OllamaChatService } from '../../llm/services/ollama-chat.service';

const SISTEMA_BASE =
  'Eres un asistente útil y directo. Responde en español salvo que el usuario escriba en otro idioma o pida otro. ' +
  'Usa Markdown (listas, tablas, bloques de código) cuando ayude a leer la respuesta. Si no sabes algo, dilo.\n\n' +
  'Los archivos que adjunta el usuario llegan como texto entre etiquetas <archivo nombre="…">, o, si son muy largos, ' +
  'como sus fragmentos más relevantes dentro de <fragmentos_relevantes>; las imágenes llegan como imágenes. Básate en ' +
  'ellos cuando pregunte por su contenido y menciona de qué archivo sale cada dato. Si lo que pide no está en los ' +
  'fragmentos que recibiste, dilo en vez de suponerlo.';

/** Los tres proveedores del chat libre detrás de una sola interfaz. A diferencia del agente, aquí no hay verificadores. */
@Injectable()
export class ChatService {
  private readonly proveedores: Record<ProveedorId, ProveedorChat>;

  constructor(ollama: OllamaChatService, deepseek: DeepseekService, claude: ClaudeCliService) {
    this.proveedores = { ollama, deepseek, claude };
  }

  estados(): Promise<EstadoProveedor[]> {
    return Promise.all(Object.values(this.proveedores).map((p) => p.estado()));
  }

  /**
   * El proveedor, si está disponible y el modelo es uno de los suyos (nada de nombres arbitrarios hacia el CLI),
   * con el esfuerzo resuelto: el pedido si el modelo lo admite, su valor por defecto si no se pidió, o ninguno.
   */
  async proveedorListo(id: ProveedorId, modelo: string, esfuerzo?: Esfuerzo): Promise<{ proveedor: ProveedorChat; esfuerzo: Esfuerzo | null; modelo: ModeloInfo }> {
    const proveedor = this.proveedores[id];
    const estado = await proveedor.estado();
    if (!estado.disponible) throw new HttpException(`${estado.nombre} no está disponible. ${estado.nota ?? ''}`.trim(), 503);
    const info = estado.modelos.find((m) => m.id === modelo);
    if (!info) throw new BadRequestException(`${estado.nombre} no tiene el modelo «${modelo}».`);
    if (esfuerzo && !info.esfuerzos.includes(esfuerzo)) {
      throw new BadRequestException(info.esfuerzos.length ? `${info.nombre} admite estos niveles: ${info.esfuerzos.join(', ')}.` : `${info.nombre} no tiene niveles de esfuerzo.`);
    }
    return { proveedor, esfuerzo: esfuerzo ?? info.esfuerzoPorDefecto, modelo: info };
  }

  sistema(instrucciones?: string): string {
    const extra = instrucciones?.trim();
    return extra ? `${SISTEMA_BASE}\n\nInstrucciones del usuario para esta conversación:\n${extra}` : SISTEMA_BASE;
  }
}

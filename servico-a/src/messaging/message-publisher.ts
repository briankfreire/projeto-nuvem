import type { EstadoFilaDto } from "../dtos/relatorio-stats.dto";
import type { MensagemRelatorio } from "./topologia";

/**
 * Abstração do produtor (mesma ideia do Repository). O service conhece só esta
 * interface; o container.ts decide se a implementação é RabbitMQ ou em memória.
 */
export interface MessagePublisher {
  /** Resolve só depois que o broker CONFIRMAR o recebimento (publisher confirms). */
  publicar(msg: MensagemRelatorio): Promise<void>;
}

/** Consulta o estado da fila para o painel (mensagens prontas e consumidores). */
export interface FilaMonitor {
  estado(): Promise<EstadoFilaDto>;
}

/** Implementação em memória, usada nos testes. */
export class InMemoryPublisher implements MessagePublisher, FilaMonitor {
  readonly publicadas: MensagemRelatorio[] = [];
  disponivel = true;

  async publicar(msg: MensagemRelatorio) {
    if (!this.disponivel) throw new Error("RabbitMQ indisponível (simulado)");
    this.publicadas.push(msg);
  }

  async estado(): Promise<EstadoFilaDto> {
    return this.disponivel
      ? { conectado: true, mensagens: this.publicadas.length, consumidores: 0 }
      : { conectado: false, mensagens: null, consumidores: null };
  }
}

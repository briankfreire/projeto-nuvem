import amqp, { type Channel, type ChannelModel, type ConfirmChannel } from "amqplib";
import type { Config } from "../config/config";
import type { EstadoFilaDto } from "../dtos/relatorio-stats.dto";
import { logger } from "../shared/logger";
import type { FilaMonitor, MessagePublisher } from "./message-publisher";
import { declararTopologia, TOPOLOGIA, type MensagemRelatorio } from "./topologia";

const TIMEOUT_CONFIRMACAO_MS = 5_000;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function urlRabbitMq(cfg: Config): string {
  const u = encodeURIComponent(cfg.RABBITMQ_USER);
  const p = encodeURIComponent(cfg.RABBITMQ_PASSWORD);
  const vhost = encodeURIComponent(cfg.RABBITMQ_VHOST);
  return `amqp://${u}:${p}@${cfg.RABBITMQ_HOST}:${cfg.RABBITMQ_PORT}/${vhost}`;
}

/**
 * Conexão do Serviço A com o RabbitMQ.
 *
 * A API NÃO depende do RabbitMQ para continuar disponível: se o broker cair,
 * esta classe reconecta EM SEGUNDO PLANO, com espera crescente (1 s, 2 s, 4 s... até 15 s).
 * Enquanto isso, os pedidos continuam sendo gravados no PostgreSQL e o
 * reconciliador (outbox) publica tudo quando o broker voltar.
 *
 * (O worker, ao contrário, adota fail fast: sem broker ele não tem o que fazer.)
 */
export class ConexaoRabbitMq implements MessagePublisher, FilaMonitor {
  private conn: ChannelModel | null = null;
  private canalPublicacao: ConfirmChannel | null = null;
  private canalConsulta: Channel | null = null;
  private encerrando = false;
  private conectando = false;

  constructor(private readonly url: string) {}

  get conectado() {
    return this.canalPublicacao !== null;
  }

  iniciar() {
    void this.conectarEmSegundoPlano();
  }

  private async conectarEmSegundoPlano() {
    if (this.conectando || this.encerrando) return;
    this.conectando = true;
    let espera = 1_000;
    let tentativa = 0;

    while (!this.encerrando) {
      tentativa++;
      try {
        const conn = await amqp.connect(this.url, { clientProperties: { connection_name: "servico-a" } });
        const pub = await conn.createConfirmChannel();
        await declararTopologia(pub);
        const consulta = await conn.createChannel();

        conn.on("error", (err) => logger.warn({ evento: "rabbitmq.erro", erro: err.message }));
        conn.on("close", () => {
          this.conn = this.canalPublicacao = this.canalConsulta = null;
          if (this.encerrando) return;
          logger.warn({ evento: "rabbitmq.conexao_perdida", acao: "reconectando em segundo plano" });
          void this.conectarEmSegundoPlano();
        });
        // Se um canal fechar por erro, fecha a conexão inteira para reconectar do zero
        pub.on("close", () => !this.encerrando && conn.close().catch(() => undefined));
        consulta.on("error", () => undefined);
        consulta.on("close", () => {
          this.canalConsulta = null;
        });

        this.conn = conn;
        this.canalPublicacao = pub;
        this.canalConsulta = consulta;
        logger.info({ evento: "rabbitmq.conectado", tentativa });
        break;
      } catch (err) {
        logger.warn({ evento: "rabbitmq.indisponivel", tentativa, proximaTentativaMs: espera, erro: (err as Error).message });
        await esperar(espera);
        espera = Math.min(espera * 2, 15_000);
      }
    }
    this.conectando = false;
  }

  /**
   * PUBLISHER CONFIRMS: "enviei" e "o broker recebeu e gravou" são eventos diferentes.
   * Esta Promise só resolve quando o RabbitMQ confirma (ou falha após 5 s).
   */
  publicar(msg: MensagemRelatorio): Promise<void> {
    const ch = this.canalPublicacao;
    if (!ch) return Promise.reject(new Error("RabbitMQ desconectado"));

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("RabbitMQ não confirmou em 5 s")), TIMEOUT_CONFIRMACAO_MS);
      try {
        ch.publish(
          TOPOLOGIA.exchange,
          TOPOLOGIA.routingKey,
          Buffer.from(JSON.stringify(msg)),
          {
            persistent: true, // a mensagem é gravada em disco pelo broker
            contentType: "application/json",
            messageId: msg.relatorioId,
            correlationId: msg.requestId,
            timestamp: Math.floor(Date.now() / 1000),
            type: "relatorio.processar",
          },
          (err) => {
            clearTimeout(timer);
            if (err) reject(err);
            else resolve();
          },
        );
      } catch (err) {
        clearTimeout(timer);
        reject(err as Error);
      }
    });
  }

  async estado(): Promise<EstadoFilaDto> {
    const ch = this.canalConsulta;
    if (!ch) return { conectado: false, mensagens: null, consumidores: null };
    try {
      const q = await ch.checkQueue(TOPOLOGIA.fila);
      return { conectado: true, mensagens: q.messageCount, consumidores: q.consumerCount };
    } catch {
      return { conectado: this.conectado, mensagens: null, consumidores: null };
    }
  }

  async fechar() {
    this.encerrando = true;
    await this.conn?.close().catch(() => undefined);
  }
}

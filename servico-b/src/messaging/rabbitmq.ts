import amqp, { type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import type { Config } from "../config/config";
import { logger } from "../shared/logger";
import type { ErroHandler } from "./erro.handler";
import type { PedidoHandler } from "./pedido.handler";
import { declararTopologia, TOPOLOGIA } from "./topologia";

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function urlRabbitMq(cfg: Config): string {
  const u = encodeURIComponent(cfg.RABBITMQ_USER);
  const p = encodeURIComponent(cfg.RABBITMQ_PASSWORD);
  return `amqp://${u}:${p}@${cfg.RABBITMQ_HOST}:${cfg.RABBITMQ_PORT}/${encodeURIComponent(cfg.RABBITMQ_VHOST)}`;
}

/** Tenta conectar algumas vezes na partida; se não conseguir, encerra (o orquestrador reinicia). */
export async function conectar(url: string, tentativasMax = 15): Promise<ChannelModel> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      const conn = await amqp.connect(url, { clientProperties: { connection_name: "servico-b" } });
      logger.info({ evento: "rabbitmq.conectado", tentativa });
      return conn;
    } catch (err) {
      logger.warn({ evento: "rabbitmq.indisponivel", tentativa, erro: (err as Error).message });
      if (tentativa >= tentativasMax) throw err;
      await esperar(Math.min(1000 * tentativa, 5000));
    }
  }
}

/** Quantas vezes a mensagem já foi entregue (a quorum queue informa no cabeçalho). */
const entregas = (msg: ConsumeMessage) => Number(msg.properties.headers?.["x-delivery-count"] ?? 0) + 1;

/**
 * Consome a fila principal.
 *  - prefetch(1): cada worker tem no máximo UMA mensagem sem ack. Quando entram
 *    mais workers, ainda há mensagens "Ready" para eles: escalar aumenta de fato a vazão.
 *  - ack manual, só depois do COMMIT no banco.
 */
export async function consumirPedidos(conn: ChannelModel, handler: PedidoHandler) {
  const ch = await conn.createChannel();
  await declararTopologia(ch);
  await ch.prefetch(1);
  return consumir(ch, TOPOLOGIA.fila, async (msg) => {
    try {
      const decisao = await handler.processar(msg.content, entregas(msg));
      if (decisao === "ack") ch.ack(msg);
      else if (decisao === "reenfileirar") ch.nack(msg, false, true);
      else ch.reject(msg, false); // -> dead-letter
    } catch (err) {
      // erro técnico inesperado (ex.: banco fora): devolve para a fila e tenta de novo
      logger.error({ evento: "processamento.erro_tecnico", erro: (err as Error).message, acao: "reenfileirar" });
      ch.nack(msg, false, true);
    }
  });
}

/** Consome a fila de erro (dead-letter) e dá estado final aos relatórios. */
export async function consumirErros(conn: ChannelModel, handler: ErroHandler) {
  const ch = await conn.createChannel();
  await ch.prefetch(5);
  return consumir(ch, TOPOLOGIA.filaErro, async (msg) => {
    try {
      const motivo = msg.properties.headers?.["x-first-death-reason"] as string | undefined;
      await handler.processar(msg.content, motivo);
      ch.ack(msg);
    } catch (err) {
      logger.error({ evento: "dead_letter.erro_tecnico", erro: (err as Error).message });
      ch.nack(msg, false, true);
    }
  });
}

async function consumir(ch: Channel, fila: string, tratar: (m: ConsumeMessage) => Promise<void>) {
  let emAndamento: Promise<void> = Promise.resolve();
  const { consumerTag } = await ch.consume(
    fila,
    (msg) => {
      if (msg) emAndamento = tratar(msg);
    },
    { noAck: false },
  );
  logger.info({ evento: "consumo.iniciado", fila });
  return {
    /** Para de receber mensagens novas e espera a atual terminar. */
    async parar() {
      await ch.cancel(consumerTag).catch(() => undefined);
      await emAndamento;
    },
  };
}

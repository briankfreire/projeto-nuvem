/**
 * TOPOLOGIA E CONTRATO DO RABBITMQ
 * Arquivo IDÊNTICO em servico-a e servico-b. Os dois declaram exatamente as mesmas
 * exchanges, filas e argumentos: qualquer um pode subir primeiro sem conflito
 * (declarações diferentes da mesma fila causariam PRECONDITION_FAILED).
 *
 *  Serviço A --publica--> [exchange "relatorios" (direct)] --routing key "processar"-->
 *      [fila "relatorios.processar" (quorum)] --> Serviço B (workers)
 *
 *  Depois de 5 entregas sem sucesso, ou rejeição sem reenfileirar:
 *      [fila "relatorios.processar"] --> [exchange "relatorios.dlx" (fanout)] -->
 *      [fila "relatorios.erro" (quorum)] --> Serviço B marca o relatório como "erro"
 */
import type { Channel } from "amqplib";
import { z } from "zod";

export const TOPOLOGIA = {
  exchange: "relatorios",
  routingKey: "processar",
  fila: "relatorios.processar",
  exchangeDlx: "relatorios.dlx",
  filaErro: "relatorios.erro",
  limiteEntregas: 5,
} as const;

export async function declararTopologia(ch: Channel) {
  // Exchange nomeada: o produtor publica na exchange, não no nome da fila.
  // Novos destinos podem ser ligados por novos bindings sem mudar o produtor.
  await ch.assertExchange(TOPOLOGIA.exchange, "direct", { durable: true });
  await ch.assertExchange(TOPOLOGIA.exchangeDlx, "fanout", { durable: true });

  // Fila de erro (dead-letter)
  await ch.assertQueue(TOPOLOGIA.filaErro, { durable: true, arguments: { "x-queue-type": "quorum" } });
  await ch.bindQueue(TOPOLOGIA.filaErro, TOPOLOGIA.exchangeDlx, "");

  // Fila principal: QUORUM (durável e replicável), com LIMITE DE ENTREGAS.
  // Uma mensagem que falha repetidamente não circula para sempre: vai para a DLX.
  await ch.assertQueue(TOPOLOGIA.fila, {
    durable: true,
    arguments: {
      "x-queue-type": "quorum",
      "x-delivery-limit": TOPOLOGIA.limiteEntregas,
      "x-dead-letter-exchange": TOPOLOGIA.exchangeDlx,
    },
  });
  await ch.bindQueue(TOPOLOGIA.fila, TOPOLOGIA.exchange, TOPOLOGIA.routingKey);
}

export const VERSAO_CONTRATO = 1;

/**
 * Mensagem = AVISO DE TRABALHO, não o estado. O worker lê os dados do relatório
 * no PostgreSQL, que é a fonte da verdade.
 */
export const mensagemRelatorioSchema = z.object({
  versao: z.literal(VERSAO_CONTRATO),
  relatorioId: z.uuid(),
  requestId: z.string().min(1).max(128),
});
export type MensagemRelatorio = z.infer<typeof mensagemRelatorioSchema>;

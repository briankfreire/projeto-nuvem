import os from "node:os";
import type { RelatorioRepository } from "../repositories/relatorio.repository";
import type { GeradorRelatorioService } from "../services/gerador-relatorio.service";
import { logger } from "../shared/logger";
import { mensagemRelatorioSchema, type MensagemRelatorio } from "./topologia";

/**
 * O que fazer com a mensagem:
 *  - "ack"          concluído (ou nada a fazer): remove da fila;
 *  - "reenfileirar" falha TÉCNICA (pode dar certo depois): nack com requeue;
 *  - "rejeitar"     mensagem impossível de processar: reject sem requeue -> dead-letter.
 */
export type Decisao = "ack" | "reenfileirar" | "rejeitar";

export class ErroTecnicoSimulado extends Error {}

/**
 * Tratamento de UM pedido (separado do amqplib para poder ser testado).
 *
 * ERRO DE NEGÓCIO x ERRO TÉCNICO:
 *  - medidor desativado: repetir não muda a realidade -> status "erro" + ack;
 *  - banco fora do ar / falha simulada: tentar de novo pode funcionar -> reenfileirar.
 *    Depois de 5 entregas, o RabbitMQ manda para a dead-letter e o
 *    ErroHandler marca o relatório como "erro".
 *
 * IDEMPOTÊNCIA: a entrega é "pelo menos uma vez". Se o relatório já está
 * concluído ou em erro, a mensagem repetida é só confirmada, sem refazer nada.
 */
export class PedidoHandler {
  private readonly instancia = os.hostname();

  constructor(
    private readonly repo: RelatorioRepository,
    private readonly gerador: GeradorRelatorioService,
    private readonly taxaFalhaSimulada: number,
    private readonly sorteio: () => number = Math.random,
  ) {}

  async processar(conteudo: Buffer, entregas: number): Promise<Decisao> {
    let msg: MensagemRelatorio;
    try {
      const parsed = mensagemRelatorioSchema.safeParse(JSON.parse(conteudo.toString("utf-8")));
      if (!parsed.success) {
        logger.error({ evento: "mensagem.contrato_invalido", erro: parsed.error.issues[0]?.message, destino: "dead-letter" });
        return "rejeitar";
      }
      msg = parsed.data;
    } catch {
      logger.error({ evento: "mensagem.json_invalido", destino: "dead-letter" });
      return "rejeitar";
    }

    const ids = { requestId: msg.requestId, relatorioId: msg.relatorioId };
    logger.info({ evento: "mensagem.recebida", ...ids, entrega: entregas });

    // Erros do banco aqui sobem como exceção -> o consumidor faz nack com requeue (erro técnico).
    const reserva = await this.repo.reservar(msg.relatorioId, this.instancia);

    if (reserva.tipo === "inexistente") {
      logger.error({ evento: "mensagem.relatorio_inexistente", ...ids, destino: "dead-letter" });
      return "rejeitar";
    }
    if (reserva.tipo === "finalizado") {
      logger.info({ evento: "mensagem.ignorada_ja_finalizado", ...ids, status: reserva.status });
      return "ack";
    }

    logger.info({ evento: "processamento.iniciado", ...ids, tentativa: reserva.tentativa, medidor: reserva.medidor, mes: reserva.mes });

    if (!reserva.medidorAtivo) {
      await this.repo.marcarErro(msg.relatorioId, `Medidor ${reserva.medidor} está desativado`, this.instancia);
      logger.warn({ evento: "processamento.erro_negocio", ...ids, motivo: "medidor desativado" });
      return "ack";
    }

    if (this.taxaFalhaSimulada > 0 && this.sorteio() < this.taxaFalhaSimulada) {
      logger.warn({ evento: "processamento.falha_simulada", ...ids, entrega: entregas, acao: "reenfileirar" });
      return "reenfileirar";
    }

    const resultado = await this.gerador.gerar({ medidor: reserva.medidor, mes: reserva.mes, tipo: reserva.tipoConsumidor });
    const gravou = await this.repo.concluir(msg.relatorioId, this.instancia, resultado);

    logger.info({
      evento: gravou ? "processamento.concluido" : "processamento.ja_concluido_por_outra_copia",
      ...ids,
      consumoKwh: resultado.consumoTotalKwh,
      duracaoMs: resultado.duracaoMs,
    });
    return "ack"; // ack SÓ depois do COMMIT
  }
}

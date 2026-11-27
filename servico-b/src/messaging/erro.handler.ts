import os from "node:os";
import type { RelatorioRepository } from "../repositories/relatorio.repository";
import { logger } from "../shared/logger";
import { mensagemRelatorioSchema, TOPOLOGIA } from "./topologia";

/**
 * Consumidor da fila de ERRO (dead-letter).
 *
 * Quando uma mensagem esgota o limite de 5 entregas, o RabbitMQ a move para
 * "relatorios.erro". Sem este consumidor, o relatório ficaria em "processando"
 * para sempre. Aqui ele recebe um ESTADO FINAL: "erro".
 */
export class ErroHandler {
  private readonly instancia = os.hostname();

  constructor(private readonly repo: RelatorioRepository) {}

  async processar(conteudo: Buffer, motivoRabbit: string | undefined): Promise<void> {
    let relatorioId: string | undefined;
    let requestId: string | undefined;
    try {
      const parsed = mensagemRelatorioSchema.safeParse(JSON.parse(conteudo.toString("utf-8")));
      if (parsed.success) ({ relatorioId, requestId } = parsed.data);
    } catch {
      /* conteúdo ilegível: só registra */
    }

    if (!relatorioId) {
      logger.error({ evento: "dead_letter.mensagem_descartada", motivo: motivoRabbit, conteudo: conteudo.toString("utf-8").slice(0, 200) });
      return;
    }

    const motivo =
      motivoRabbit === "delivery_limit"
        ? `Esgotou o limite de ${TOPOLOGIA.limiteEntregas} reentregas; encaminhado para a fila de erro`
        : "Mensagem rejeitada; encaminhada para a fila de erro";
    const marcou = await this.repo.marcarErro(relatorioId, motivo, this.instancia);
    logger.warn({ evento: "dead_letter.relatorio_em_erro", requestId, relatorioId, motivo: motivoRabbit, alterado: marcou });
  }
}

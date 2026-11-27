import type { Relatorio } from "../domain/relatorio.entity";
import type { CreateRelatorioDto } from "../dtos/create-relatorio.dto";
import type { ListRelatoriosQueryDto } from "../dtos/list-relatorios-query.dto";
import { NotFoundError } from "../errors/app-error";
import type { MessagePublisher } from "../messaging/message-publisher";
import { VERSAO_CONTRATO } from "../messaging/topologia";
import type { RelatorioRepository } from "../repositories/relatorio.repository";
import type { IdGenerator } from "../shared/id-generator";
import { logger } from "../shared/logger";

export interface ResultadoPedido {
  relatorio: Relatorio;
  /** true = a Idempotency-Key já tinha sido usada; nada novo foi criado. */
  repetido: boolean;
}

/** Regras da aplicação para pedidos de relatório. */
export class RelatorioService {
  constructor(
    private readonly repo: RelatorioRepository,
    private readonly publisher: MessagePublisher,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * ACEITAR, REGISTRAR, PUBLICAR e RESPONDER. O processamento pesado NÃO acontece aqui.
   *
   *  1. grava o relatório "pendente" no PostgreSQL (e confirma: COMMIT);
   *  2. SÓ DEPOIS publica a mensagem e espera a confirmação do RabbitMQ;
   *  3. registra a publicação (publicado_em).
   *
   * Se o broker estiver fora, o pedido continua gravado com publicado_em vazio,
   * e o reconciliador publica depois. O cliente recebe 202 do mesmo jeito.
   */
  async criar(dto: CreateRelatorioDto, requestId: string, idempotencyKey: string | null): Promise<ResultadoPedido> {
    const { relatorio, existente } = await this.repo.criar({
      id: this.ids.next(),
      requestId,
      medidor: dto.medidor,
      mes: dto.mes,
      idempotencyKey,
    });

    if (existente) {
      logger.info({ evento: "relatorio.pedido_repetido", requestId, relatorioId: relatorio.id, idempotencyKey });
      return { relatorio, repetido: true };
    }

    logger.info({ evento: "relatorio.criado", requestId, relatorioId: relatorio.id, medidor: dto.medidor, mes: dto.mes });

    try {
      await this.publisher.publicar({ versao: VERSAO_CONTRATO, relatorioId: relatorio.id, requestId });
      await this.repo.marcarPublicado(relatorio.id);
      relatorio.publicadoEm = new Date();
      logger.info({ evento: "mensagem.publicada", requestId, relatorioId: relatorio.id });
    } catch (err) {
      logger.warn({
        evento: "mensagem.publicacao_adiada",
        requestId,
        relatorioId: relatorio.id,
        erro: (err as Error).message,
        acao: "o reconciliador vai publicar quando o RabbitMQ voltar",
      });
    }
    return { relatorio, repetido: false };
  }

  listar(q: ListRelatoriosQueryDto) {
    return this.repo.listar(q);
  }

  async obter(id: string): Promise<Relatorio> {
    const r = await this.repo.buscarPorId(id);
    if (!r) throw new NotFoundError("Relatório");
    return r;
  }
}

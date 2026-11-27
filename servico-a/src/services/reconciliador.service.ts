import type { MessagePublisher } from "../messaging/message-publisher";
import { VERSAO_CONTRATO } from "../messaging/topologia";
import type { RelatorioRepository } from "../repositories/relatorio.repository";
import { logger } from "../shared/logger";

/**
 * OUTBOX + RECONCILIADOR
 *
 * Gravar no PostgreSQL e publicar no RabbitMQ são operações em sistemas diferentes:
 * não existe uma transação única que cubra os dois. Se o broker estiver fora (ou o
 * processo morrer) entre o COMMIT e a publicação, o relatório ficaria "pendente"
 * para sempre, sem mensagem.
 *
 * Por isso publicado_em funciona como um outbox: a cada 5 s, relatórios com mais de
 * 10 s e publicado_em vazio voltam a ser publicados. Se acontecer de publicar duas
 * vezes, não tem problema: o worker é idempotente.
 */
export class Reconciliador {
  private timer: NodeJS.Timeout | null = null;
  private rodando = false;

  constructor(
    private readonly repo: RelatorioRepository,
    private readonly publisher: MessagePublisher,
    private readonly intervaloMs: number,
    private readonly idadeSegundos: number,
    private readonly lote = 50,
  ) {}

  iniciar() {
    this.timer = setInterval(() => void this.executar(), this.intervaloMs);
    this.timer.unref();
  }

  parar() {
    if (this.timer) clearInterval(this.timer);
  }

  async executar(): Promise<number> {
    if (this.rodando) return 0; // evita dois ciclos sobrepostos na mesma réplica
    this.rodando = true;
    try {
      const n = await this.repo.reconciliarNaoPublicados(this.idadeSegundos, this.lote, async (r) => {
        try {
          await this.publisher.publicar({ versao: VERSAO_CONTRATO, relatorioId: r.id, requestId: r.requestId });
          logger.info({ evento: "reconciliador.republicado", requestId: r.requestId, relatorioId: r.id });
          return true;
        } catch {
          return false;
        }
      });
      return n;
    } catch (err) {
      logger.warn({ evento: "reconciliador.falha", erro: (err as Error).message });
      return 0;
    } finally {
      this.rodando = false;
    }
  }
}

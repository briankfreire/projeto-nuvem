import type { RelatorioStatsDto } from "../dtos/relatorio-stats.dto";
import type { FilaMonitor } from "../messaging/message-publisher";
import type { RelatorioRepository } from "../repositories/relatorio.repository";

/** Indicadores do painel: contagens vêm do banco (verdade); a fila, do RabbitMQ. */
export class RelatorioStatsService {
  constructor(
    private readonly repo: RelatorioRepository,
    private readonly fila: FilaMonitor,
  ) {}

  async obter(): Promise<RelatorioStatsDto> {
    const [contagens, fila] = await Promise.all([this.repo.contagens(), this.fila.estado()]);
    return { ...contagens, fila };
  }
}

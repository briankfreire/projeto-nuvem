import { RelatorioController } from "./controllers/relatorio.controller";
import type { FilaMonitor, MessagePublisher } from "./messaging/message-publisher";
import type { RelatorioRepository } from "./repositories/relatorio.repository";
import { RelatorioService } from "./services/relatorio.service";
import { RelatorioStatsService } from "./services/relatorio-stats.service";
import { uuidGenerator, type IdGenerator } from "./shared/id-generator";

export interface Dependencies {
  repository: RelatorioRepository;
  publisher: MessagePublisher;
  filaMonitor: FilaMonitor;
  ids?: IdGenerator;
  /** false durante o encerramento: a readiness passa a responder 503. */
  aceitandoTrafego?: () => boolean;
}

/**
 * COMPOSITION ROOT: o único lugar que liga as implementações concretas.
 *  - server.ts passa PostgresRelatorioRepository + ConexaoRabbitMq;
 *  - os testes passam InMemoryRelatorioRepository + InMemoryPublisher.
 */
export function buildContainer(deps: Dependencies) {
  const ids = deps.ids ?? uuidGenerator;
  const relatorioService = new RelatorioService(deps.repository, deps.publisher, ids);
  const statsService = new RelatorioStatsService(deps.repository, deps.filaMonitor);
  const relatorioController = new RelatorioController(relatorioService, statsService);
  return { ids, relatorioService, statsService, relatorioController };
}

import type { Config } from "./config/config";
import { ErroHandler } from "./messaging/erro.handler";
import { PedidoHandler } from "./messaging/pedido.handler";
import type { RelatorioRepository } from "./repositories/relatorio.repository";
import { GeradorRelatorioService } from "./services/gerador-relatorio.service";
import { systemClock } from "./shared/clock";

/** Composition root do worker. */
export function buildContainer(repo: RelatorioRepository, cfg: Pick<Config, "TRABALHO_CPU_MS" | "TAXA_FALHA_SIMULADA">) {
  const gerador = new GeradorRelatorioService(systemClock, cfg.TRABALHO_CPU_MS);
  return {
    pedidoHandler: new PedidoHandler(repo, gerador, cfg.TAXA_FALHA_SIMULADA),
    erroHandler: new ErroHandler(repo),
  };
}

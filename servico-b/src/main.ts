import { carregarConfig } from "./config/config";
import { buildContainer } from "./container";
import { criarPool } from "./db/pool";
import { iniciarHealthServer } from "./health";
import { conectar, consumirErros, consumirPedidos, urlRabbitMq } from "./messaging/rabbitmq";
import { PostgresRelatorioRepository } from "./repositories/postgres-relatorio.repository";
import { logger } from "./shared/logger";

async function main() {
  const cfg = carregarConfig();
  let saudavel = false;
  const health = iniciarHealthServer(cfg.HEALTH_PORT, () => saudavel);

  const pool = criarPool(cfg);
  const repo = new PostgresRelatorioRepository(pool);
  const { pedidoHandler, erroHandler } = buildContainer(repo, cfg);

  const conn = await conectar(urlRabbitMq(cfg));

  // FAIL FAST: se a conexão cair, o worker encerra. O Docker/Kubernetes sobe uma
  // instância limpa e o RabbitMQ devolve à fila as mensagens que estavam sem ack.
  // Assim o worker nunca fica "vivo" sem consumir, com a fila crescendo em silêncio.
  conn.on("close", () => {
    saudavel = false;
    logger.error({ evento: "rabbitmq.conexao_perdida", acao: "encerrando (fail fast)" });
    process.exit(1);
  });
  conn.on("error", (err) => logger.error({ evento: "rabbitmq.erro", erro: err.message }));

  const pedidos = await consumirPedidos(conn, pedidoHandler);
  const erros = await consumirErros(conn, erroHandler);
  saudavel = true;
  logger.info({ evento: "worker.pronto", trabalhoCpuMs: cfg.TRABALHO_CPU_MS, taxaFalhaSimulada: cfg.TAXA_FALHA_SIMULADA });

  /**
   * DESLIGAMENTO GRACIOSO (docker compose stop, scale down do HPA, kubectl delete pod):
   * cancela os consumidores (nenhuma mensagem nova chega), termina o relatório
   * atual, envia o ack e fecha as conexões, dentro do prazo do orquestrador (30 s).
   */
  let encerrando = false;
  const encerrar = async (sinal: string) => {
    if (encerrando) return;
    encerrando = true;
    logger.info({ evento: "processo.encerrando", sinal });
    conn.removeAllListeners("close");
    await Promise.all([pedidos.parar(), erros.parar()]);
    await conn.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
    health.close();
    logger.info({ evento: "processo.encerrado" });
    process.exit(0);
  };
  process.on("SIGTERM", () => void encerrar("SIGTERM"));
  process.on("SIGINT", () => void encerrar("SIGINT"));
}

main().catch((err) => {
  logger.error({ evento: "processo.falha_inicializacao", erro: (err as Error).message });
  process.exit(1);
});

import { createApp } from "./app";
import { carregarConfig } from "./config/config";
import { criarPool } from "./db/pool";
import { ConexaoRabbitMq, urlRabbitMq } from "./messaging/rabbitmq";
import { PostgresRelatorioRepository } from "./repositories/postgres-relatorio.repository";
import { Reconciliador } from "./services/reconciliador.service";
import { logger } from "./shared/logger";

const cfg = carregarConfig(); // encerra já na partida se faltar variável obrigatória

const pool = criarPool(cfg);
const repository = new PostgresRelatorioRepository(pool);

// Não espera o RabbitMQ: a API sobe e aceita pedidos mesmo se o broker ainda não estiver pronto.
const rabbit = new ConexaoRabbitMq(urlRabbitMq(cfg));
rabbit.iniciar();

let aceitandoTrafego = true;
const { app } = createApp({
  repository,
  publisher: rabbit,
  filaMonitor: rabbit,
  aceitandoTrafego: () => aceitandoTrafego,
});

const reconciliador = new Reconciliador(repository, rabbit, cfg.RECONCILIADOR_INTERVALO_MS, cfg.RECONCILIADOR_IDADE_S);
reconciliador.iniciar();

const server = app.listen(cfg.PORT, "0.0.0.0", () => {
  logger.info({ evento: "http.ouvindo", porta: cfg.PORT });
});

// O Node precisa manter as conexões keep-alive abertas por MAIS tempo que o NGINX.
// Se o Node fechasse primeiro, o NGINX poderia reutilizar uma conexão já fechada
// e devolver 502 Bad Gateway de vez em quando.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

/**
 * Encerramento gracioso (docker stop, kubectl delete pod, rollout):
 *  1. readiness passa a 503 -> sai do balanceamento;
 *  2. para de aceitar conexões novas e termina as requisições em andamento;
 *  3. fecha RabbitMQ e banco.
 */
let encerrando = false;
async function encerrar(sinal: string) {
  if (encerrando) return;
  encerrando = true;
  aceitandoTrafego = false;
  logger.info({ evento: "processo.encerrando", sinal });

  reconciliador.parar();
  const forcar = setTimeout(() => process.exit(1), 25_000);
  forcar.unref();

  await new Promise<void>((resolve) => server.close(() => resolve()));
  server.closeIdleConnections();
  await rabbit.fechar();
  await pool.end().catch(() => undefined);
  logger.info({ evento: "processo.encerrado" });
  process.exit(0);
}
process.on("SIGTERM", () => void encerrar("SIGTERM"));
process.on("SIGINT", () => void encerrar("SIGINT"));

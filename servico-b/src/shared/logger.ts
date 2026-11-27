import os from "node:os";
import pino from "pino";

/**
 * Logs estruturados em JSON (uma linha por evento).
 * Todo evento ligado a uma requisição leva o requestId gerado pelo NGINX, e
 * todo evento ligado a um relatório leva o relatorioId. Assim é possível seguir
 * a mesma operação no NGINX, no Serviço A e nas réplicas do worker:
 *
 *   docker compose logs | grep <requestId>
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { servico: "servico-b", instancia: os.hostname() },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ nivel: label }) },
});

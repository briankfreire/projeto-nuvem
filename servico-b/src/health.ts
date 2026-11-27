import http from "node:http";
import { logger } from "./shared/logger";

/**
 * Servidor HTTP mínimo SÓ para health check (Docker e probes do Kubernetes).
 * Não faz parte do fluxo: ninguém chama o worker por HTTP, e a porta não é publicada.
 */
export function iniciarHealthServer(porta: number, estaSaudavel: () => boolean) {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      const ok = estaSaudavel();
      res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: ok ? "ok" : "indisponivel" }));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(porta, "0.0.0.0", () => logger.info({ evento: "health.ouvindo", porta }));
  return server;
}

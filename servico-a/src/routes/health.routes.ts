import { Router } from "express";
import type { RelatorioRepository } from "../repositories/relatorio.repository";

/**
 * Health checks em DUAS perguntas diferentes:
 *
 *  /api/health/live  -> "o processo está vivo?"  Não consulta nada externo.
 *                       Se falhar, o orquestrador REINICIA o container.
 *  /api/health/ready -> "posso receber tráfego?" Consulta o PostgreSQL.
 *                       Se falhar, o Pod sai do balanceamento, SEM ser reiniciado.
 *
 * O RabbitMQ NÃO entra na readiness: graças ao outbox, a API continua aceitando
 * pedidos mesmo com o broker fora. Reiniciar a API não resolveria a queda do banco
 * nem do broker; só criaria reinicializações em cadeia.
 *
 * Estas rotas NÃO são públicas: o NGINX responde 404 para /api/health/*.
 * Docker e Kubernetes chamam o container diretamente.
 */
export function healthRoutes(repo: RelatorioRepository, aceitandoTrafego: () => boolean): Router {
  const r = Router();

  r.get("/live", (_req, res) => {
    res.json({ status: "vivo" });
  });

  r.get("/ready", async (_req, res) => {
    if (!aceitandoTrafego()) {
      res.status(503).json({ status: "encerrando" });
      return;
    }
    try {
      await repo.ping();
      res.json({ status: "pronto", banco: "ok" });
    } catch {
      res.status(503).json({ status: "indisponivel", banco: "falhou" });
    }
  });

  return r;
}

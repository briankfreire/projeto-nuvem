import express from "express";
import { buildContainer, type Dependencies } from "./container";
import { errorHandler } from "./middlewares/error-handler";
import { notFound } from "./middlewares/not-found";
import { requestId } from "./middlewares/request-id";
import { healthRoutes } from "./routes/health.routes";
import { relatorioRoutes } from "./routes/relatorio.routes";

/**
 * Monta a aplicação Express sem abrir porta (servidor real e testes usam a mesma função).
 * Sem cors(): o navegador acessa front e API pela mesma origem (o NGINX).
 */
export function createApp(deps: Dependencies) {
  const container = buildContainer(deps);
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", true); // atrás do NGINX

  // health antes do log de requisições: não polui os logs com as sondas
  app.use("/api/health", healthRoutes(deps.repository, deps.aceitandoTrafego ?? (() => true)));

  app.use(requestId(container.ids));
  app.use(express.json({ limit: "16kb" }));
  app.use("/api/relatorios", relatorioRoutes(container.relatorioController));

  app.use(notFound);
  app.use(errorHandler);

  return { app, container };
}

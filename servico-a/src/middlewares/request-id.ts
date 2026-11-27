import type { NextFunction, Request, Response } from "express";
import type { IdGenerator } from "../shared/id-generator";
import { logger } from "../shared/logger";

/**
 * Usa o X-Request-Id criado pelo NGINX (ponto de entrada). Se a chamada não
 * passou pelo NGINX (testes, health check), gera um. O id volta no cabeçalho
 * da resposta e vai para todos os logs desta requisição.
 */
export function requestId(ids: IdGenerator) {
  return (req: Request, res: Response, next: NextFunction) => {
    const recebido = req.header("x-request-id");
    const id = recebido && /^[\w-]{1,128}$/.test(recebido) ? recebido : ids.next();
    res.locals.requestId = id;
    res.setHeader("X-Request-Id", id);

    const inicio = process.hrtime.bigint();
    res.on("finish", () => {
      logger.info({
        evento: "http.requisicao",
        requestId: id,
        metodo: req.method,
        caminho: req.originalUrl,
        status: res.statusCode,
        ms: Number((Number(process.hrtime.bigint() - inicio) / 1e6).toFixed(1)),
      });
    });
    next();
  };
}

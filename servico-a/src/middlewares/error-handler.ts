import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error";
import { logger } from "../shared/logger";

/**
 * Tradução centralizada de erros em respostas HTTP.
 *  - 4xx: DETALHADOS (dizem qual campo está errado);
 *  - 500: GENÉRICOS (só uma mensagem e o requestId). O detalhe técnico (nome de
 *    tabela, mensagem do banco...) fica apenas no log, nunca na resposta.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const requestId = res.locals.requestId as string | undefined;

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Dados inválidos",
      details: err.issues.map((i) => ({ field: i.path.join(".") || "body", message: i.message })),
    });
  }
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "JSON malformado" });
  }
  if (err instanceof Error && "type" in err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "Corpo da requisição muito grande" });
  }

  logger.error({ evento: "http.erro_inesperado", requestId, erro: err instanceof Error ? err.message : String(err) });
  return res.status(500).json({ error: "Erro interno do servidor", requestId });
}

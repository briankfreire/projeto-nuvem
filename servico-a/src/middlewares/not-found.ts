import type { NextFunction, Request, Response } from "express";

/** Rota inexistente (diferente de "relatório inexistente", que é NotFoundError no service). */
export function notFound(req: Request, res: Response, _next: NextFunction) {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
}

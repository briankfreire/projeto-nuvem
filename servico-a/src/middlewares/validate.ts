import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

interface Schemas {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
}

/**
 * Valida params, query e body com Zod e guarda o resultado em res.locals.dto.
 * Dado inválido gera ZodError, que o errorHandler transforma em 400 com o campo problemático.
 */
export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    const dto: { params?: unknown; query?: unknown; body?: unknown } = {};
    if (schemas.params) dto.params = schemas.params.parse(req.params);
    if (schemas.query) dto.query = schemas.query.parse(req.query);
    if (schemas.body) dto.body = schemas.body.parse(req.body ?? {});
    res.locals.dto = dto;
    next();
  };
}

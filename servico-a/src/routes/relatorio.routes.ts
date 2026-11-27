import { Router } from "express";
import type { RelatorioController } from "../controllers/relatorio.controller";
import { createRelatorioSchema } from "../dtos/create-relatorio.dto";
import { listRelatoriosQuerySchema } from "../dtos/list-relatorios-query.dto";
import { relatorioIdParamsSchema } from "../dtos/relatorio-id-params.dto";
import { validate } from "../middlewares/validate";

export function relatorioRoutes(c: RelatorioController): Router {
  const r = Router();
  r.get("/", validate({ query: listRelatoriosQuerySchema }), c.list);
  r.get("/stats", c.getStats); // antes de "/:id", senão "stats" seria lido como id
  r.get("/:id", validate({ params: relatorioIdParamsSchema }), c.getById);
  r.post("/", validate({ body: createRelatorioSchema }), c.create);
  return r;
}

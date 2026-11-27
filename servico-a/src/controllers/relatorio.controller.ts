import type { Request, Response } from "express";
import { idempotencyKeySchema, type CreateRelatorioDto } from "../dtos/create-relatorio.dto";
import { AppError } from "../errors/app-error";
import type { ListRelatoriosQueryDto } from "../dtos/list-relatorios-query.dto";
import type { RelatorioIdParamsDto } from "../dtos/relatorio-id-params.dto";
import { RelatorioMapper } from "../mappers/relatorio.mapper";
import type { RelatorioService } from "../services/relatorio.service";
import type { RelatorioStatsService } from "../services/relatorio-stats.service";

/** Traduz HTTP <-> aplicação. Não contém regra de negócio nem SQL. */
export class RelatorioController {
  constructor(
    private readonly service: RelatorioService,
    private readonly stats: RelatorioStatsService,
  ) {}

  /**
   * POST /api/relatorios
   * 202 Accepted: o pedido foi ACEITO para processamento posterior (não está pronto).
   * 200 OK + Idempotent-Replayed: mesma Idempotency-Key de antes; devolve o relatório já existente.
   */
  create = async (req: Request, res: Response) => {
    const body = res.locals.dto.body as CreateRelatorioDto;
    const chaveValidada = idempotencyKeySchema.safeParse(req.header("idempotency-key") || undefined);
    if (!chaveValidada.success) throw new AppError(400, chaveValidada.error.issues[0]!.message);
    const chave = chaveValidada.data ?? null;

    const { relatorio, repetido } = await this.service.criar(body, res.locals.requestId as string, chave);

    if (repetido) res.setHeader("Idempotent-Replayed", "true");
    res
      .status(repetido ? 200 : 202)
      .location(`/api/relatorios/${relatorio.id}`)
      .json(RelatorioMapper.toResponse(relatorio));
  };

  list = async (_req: Request, res: Response) => {
    const lista = await this.service.listar(res.locals.dto.query as ListRelatoriosQueryDto);
    res.json(lista.map(RelatorioMapper.toResponse));
  };

  getById = async (_req: Request, res: Response) => {
    const { id } = res.locals.dto.params as RelatorioIdParamsDto;
    res.json(RelatorioMapper.toResponse(await this.service.obter(id)));
  };

  getStats = async (_req: Request, res: Response) => {
    res.json(await this.stats.obter());
  };
}

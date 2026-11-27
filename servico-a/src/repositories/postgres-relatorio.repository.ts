import type { Pool } from "pg";
import type { Relatorio } from "../domain/relatorio.entity";
import type { ListRelatoriosQueryDto } from "../dtos/list-relatorios-query.dto";
import type { ContagensDto } from "../dtos/relatorio-stats.dto";
import { UnprocessableError } from "../errors/app-error";
import { RelatorioMapper, type RelatorioRow } from "../mappers/relatorio.mapper";
import type { NovoRelatorio, RelatorioRepository, ResultadoCriacao } from "./relatorio.repository";

const num = (v: string | null) => (v === null ? null : Number(v));

export class PostgresRelatorioRepository implements RelatorioRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Um único INSERT ... SELECT, que é atômico:
   *  - confere se o medidor existe (JOIN): se não existir, nada é inserido;
   *  - copia tipo e tarifa DO BANCO para o relatório (o cliente não informa preço);
   *  - ON CONFLICT na Idempotency-Key: duas tentativas simultâneas com a mesma
   *    chave nunca criam dois relatórios (a UNIQUE do banco garante).
   * Retorna depois do COMMIT: só então a mensagem é publicada.
   */
  async criar(novo: NovoRelatorio): Promise<ResultadoCriacao> {
    const { rows } = await this.pool.query<RelatorioRow>(
      `INSERT INTO relatorio (id, request_id, idempotency_key, medidor_id, mes, tipo, tarifa_kwh)
       SELECT $1, $2, $3, m.id, $5, m.tipo, t.valor_kwh
         FROM medidor m
         JOIN tarifa t ON t.tipo = m.tipo
        WHERE m.id = $4
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [novo.id, novo.requestId, novo.idempotencyKey, novo.medidor, novo.mes],
    );
    if (rows[0]) return { relatorio: RelatorioMapper.fromRow(rows[0]), existente: false };

    // Nada inserido: ou a chave já existia, ou o medidor não existe.
    if (novo.idempotencyKey) {
      const existente = await this.pool.query<RelatorioRow>(
        "SELECT * FROM relatorio WHERE idempotency_key = $1",
        [novo.idempotencyKey],
      );
      if (existente.rows[0]) return { relatorio: RelatorioMapper.fromRow(existente.rows[0]), existente: true };
    }
    throw new UnprocessableError(`Medidor ${novo.medidor} não cadastrado`);
  }

  async marcarPublicado(id: string) {
    await this.pool.query("UPDATE relatorio SET publicado_em = now() WHERE id = $1 AND publicado_em IS NULL", [id]);
  }

  /**
   * FOR UPDATE SKIP LOCKED: com 2 ou mais réplicas do Serviço A, cada uma trava um
   * conjunto DIFERENTE de pendências; nenhuma espera pela outra nem publica o mesmo lote.
   */
  async reconciliarNaoPublicados(
    idadeSegundos: number,
    limite: number,
    publicar: (r: Relatorio) => Promise<boolean>,
  ): Promise<number> {
    const client = await this.pool.connect();
    let publicados = 0;
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<RelatorioRow>(
        `SELECT * FROM relatorio
          WHERE publicado_em IS NULL
            AND status = 'pendente'
            AND criado_em < now() - make_interval(secs => $1)
          ORDER BY criado_em
          LIMIT $2
          FOR UPDATE SKIP LOCKED`,
        [idadeSegundos, limite],
      );
      for (const row of rows) {
        if (!(await publicar(RelatorioMapper.fromRow(row)))) break; // broker caiu de novo: tenta no próximo ciclo
        await client.query("UPDATE relatorio SET publicado_em = now() WHERE id = $1", [row.id]);
        publicados++;
      }
      await client.query("COMMIT");
      return publicados;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async buscarPorId(id: string) {
    const { rows } = await this.pool.query<RelatorioRow>("SELECT * FROM relatorio WHERE id = $1", [id]);
    return rows[0] ? RelatorioMapper.fromRow(rows[0]) : null;
  }

  async listar(f: ListRelatoriosQueryDto) {
    const { rows } = await this.pool.query<RelatorioRow>(
      `SELECT * FROM relatorio
        WHERE ($1::text IS NULL OR status = $1)
          AND ($2::int  IS NULL OR medidor_id = $2)
        ORDER BY criado_em DESC
        LIMIT $3`,
      [f.status ?? null, f.medidor ?? null, f.limite],
    );
    return rows.map(RelatorioMapper.fromRow);
  }

  async contagens(): Promise<ContagensDto> {
    const { rows } = await this.pool.query<Record<string, string | null>>(
      `SELECT count(*)                                                   AS total,
              count(*) FILTER (WHERE status = 'pendente')                AS pendentes,
              count(*) FILTER (WHERE status = 'processando')             AS processando,
              count(*) FILTER (WHERE status = 'concluido')               AS concluidos,
              count(*) FILTER (WHERE status = 'erro')                    AS erros,
              count(*) FILTER (WHERE status = 'pendente' AND publicado_em IS NULL) AS aguardando_publicacao,
              round(avg(duracao_ms) FILTER (WHERE status = 'concluido')) AS tempo_proc,
              round(avg(extract(epoch FROM concluido_em - criado_em) * 1000)
                    FILTER (WHERE status = 'concluido'))                 AS tempo_total
         FROM relatorio`,
    );
    const r = rows[0]!;
    return {
      total: Number(r.total),
      pendentes: Number(r.pendentes),
      processando: Number(r.processando),
      concluidos: Number(r.concluidos),
      erros: Number(r.erros),
      aguardandoPublicacao: Number(r.aguardando_publicacao),
      tempoMedioProcessamentoMs: num(r.tempo_proc ?? null),
      tempoMedioTotalMs: num(r.tempo_total ?? null),
    };
  }

  async ping() {
    await this.pool.query("SELECT 1");
  }
}

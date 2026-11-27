import type { Pool, PoolClient } from "pg";
import type { ResultadoConsumo, TipoConsumidor } from "../domain/relatorio";
import type { RelatorioRepository, Reserva } from "./relatorio.repository";

/** Executa fn dentro de BEGIN/COMMIT; qualquer erro faz ROLLBACK (desfaz tudo). */
async function transacao<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (err) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

export class PostgresRelatorioRepository implements RelatorioRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * SELECT ... FOR UPDATE trava a linha do relatório até o COMMIT.
   * Se uma cópia duplicada da mensagem chegar a outro worker ao mesmo tempo,
   * a segunda transação ESPERA, depois enxerga o estado já atualizado.
   *
   * "processando" pode ser retomado: é o estado deixado por um worker que caiu no meio.
   */
  reservar(id: string, instancia: string): Promise<Reserva> {
    return transacao(this.pool, async (c) => {
      const { rows } = await c.query<{ status: string; medidor_id: number; mes: string; tipo: TipoConsumidor; ativo: boolean }>(
        `SELECT r.status, r.medidor_id, r.mes, r.tipo, m.ativo
           FROM relatorio r
           JOIN medidor m ON m.id = r.medidor_id
          WHERE r.id = $1
          FOR UPDATE OF r`,
        [id],
      );
      const r = rows[0];
      if (!r) return { tipo: "inexistente" };
      if (r.status === "concluido" || r.status === "erro") return { tipo: "finalizado", status: r.status };

      const upd = await c.query<{ tentativas: number }>(
        `UPDATE relatorio
            SET status = 'processando', iniciado_em = now(), processado_por = $2, tentativas = tentativas + 1
          WHERE id = $1
          RETURNING tentativas`,
        [id, instancia],
      );
      return {
        tipo: "reservado",
        medidor: r.medidor_id,
        mes: r.mes,
        tipoConsumidor: r.tipo,
        medidorAtivo: r.ativo,
        tentativa: upd.rows[0]!.tentativas,
      };
    });
  }

  /**
   * Resultado e status final mudam JUNTOS (mesma transação).
   * O custo é calculado em SQL com NUMERIC: consumo x tarifa copiada no pedido.
   */
  concluir(id: string, instancia: string, r: ResultadoConsumo): Promise<boolean> {
    return transacao(this.pool, async (c) => {
      const atual = await c.query<{ status: string }>("SELECT status FROM relatorio WHERE id = $1 FOR UPDATE", [id]);
      const status = atual.rows[0]?.status;
      if (!status || status === "concluido" || status === "erro") return false;

      await c.query(
        `UPDATE relatorio
            SET status             = 'concluido',
                concluido_em       = now(),
                processado_por     = $2,
                erro               = NULL,
                consumo_total_kwh  = $3::numeric,
                custo_estimado     = round($3::numeric * tarifa_kwh, 2),
                media_diaria_kwh   = $4::numeric,
                pico_kw            = $5::numeric,
                pico_em            = $6,
                consumo_diario_kwh = $7::numeric[],
                leituras           = $8,
                duracao_ms         = $9
          WHERE id = $1`,
        [
          id,
          instancia,
          r.consumoTotalKwh.toFixed(2),
          r.mediaDiariaKwh.toFixed(2),
          r.picoKw.toFixed(2),
          r.picoEm,
          r.consumoDiarioKwh.map((v) => v.toFixed(2)),
          r.leituras,
          r.duracaoMs,
        ],
      );
      return true;
    });
  }

  async marcarErro(id: string, motivo: string, instancia: string | null): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE relatorio
          SET status = 'erro', erro = $2, processado_por = COALESCE($3, processado_por)
        WHERE id = $1 AND status NOT IN ('concluido', 'erro')`,
      [id, motivo, instancia],
    );
    return (rowCount ?? 0) > 0;
  }
}

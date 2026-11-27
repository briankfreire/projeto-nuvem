import { describe, expect, it } from "vitest";
import type { ResultadoConsumo } from "../src/domain/relatorio";
import { ErroHandler } from "../src/messaging/erro.handler";
import { PedidoHandler } from "../src/messaging/pedido.handler";
import type { RelatorioRepository, Reserva } from "../src/repositories/relatorio.repository";
import { GeradorRelatorioService } from "../src/services/gerador-relatorio.service";
import { diasNoMes } from "../src/services/simulador-leituras";
import { systemClock } from "../src/shared/clock";

const ID = "00000000-0000-4000-8000-000000000001";
const msg = (v: object = {}) => Buffer.from(JSON.stringify({ versao: 1, relatorioId: ID, requestId: "req-1", ...v }));

/** Repositório falso que imita as regras do banco. */
class RepoFalso implements RelatorioRepository {
  status: "pendente" | "processando" | "concluido" | "erro" | null = "pendente";
  ativo = true;
  tentativas = 0;
  erro: string | null = null;
  resultado: ResultadoConsumo | null = null;
  falharBanco = false;

  async reservar(): Promise<Reserva> {
    if (this.falharBanco) throw new Error("banco fora");
    if (this.status === null) return { tipo: "inexistente" };
    if (this.status === "concluido" || this.status === "erro") return { tipo: "finalizado", status: this.status };
    this.status = "processando";
    this.tentativas++;
    return { tipo: "reservado", medidor: 42, mes: "2026-10", tipoConsumidor: "residencial", medidorAtivo: this.ativo, tentativa: this.tentativas };
  }
  async concluir(_id: string, _i: string, r: ResultadoConsumo) {
    if (this.status === "concluido" || this.status === "erro") return false;
    this.status = "concluido";
    this.resultado = r;
    return true;
  }
  async marcarErro(_id: string, motivo: string) {
    if (this.status === "concluido" || this.status === "erro") return false;
    this.status = "erro";
    this.erro = motivo;
    return true;
  }
}

const gerador = new GeradorRelatorioService(systemClock, 0);

describe("GeradorRelatorioService", () => {
  it("uma leitura por minuto, um total por dia, determinístico", async () => {
    const a = await gerador.gerar({ medidor: 42, mes: "2026-10", tipo: "residencial" });
    const b = await gerador.gerar({ medidor: 42, mes: "2026-10", tipo: "residencial" });
    expect(diasNoMes("2026-10")).toBe(31);
    expect(a.leituras).toBe(31 * 1440);
    expect(a.consumoDiarioKwh).toHaveLength(31);
    expect(a.consumoTotalKwh).toBe(b.consumoTotalKwh);
    expect(a.picoEm.toISOString().startsWith("2026-10")).toBe(true);
  });

  it("industrial consome muito mais que residencial", async () => {
    const res = await gerador.gerar({ medidor: 1, mes: "2026-10", tipo: "residencial" });
    const ind = await gerador.gerar({ medidor: 1, mes: "2026-10", tipo: "industrial" });
    expect(ind.consumoTotalKwh).toBeGreaterThan(res.consumoTotalKwh * 10);
  });
});

describe("PedidoHandler", () => {
  it("processa, grava e só então confirma (ack)", async () => {
    const repo = new RepoFalso();
    expect(await new PedidoHandler(repo, gerador, 0).processar(msg(), 1)).toBe("ack");
    expect(repo.status).toBe("concluido");
    expect(repo.resultado?.leituras).toBe(44640);
  });

  it("idempotente: mensagem repetida de relatório concluído só recebe ack", async () => {
    const repo = new RepoFalso();
    repo.status = "concluido";
    expect(await new PedidoHandler(repo, gerador, 0).processar(msg(), 2)).toBe("ack");
    expect(repo.tentativas).toBe(0);
  });

  it("retoma um relatório deixado em 'processando' por um worker que caiu", async () => {
    const repo = new RepoFalso();
    repo.status = "processando";
    repo.tentativas = 1;
    expect(await new PedidoHandler(repo, gerador, 0).processar(msg(), 2)).toBe("ack");
    expect(repo.status).toBe("concluido");
    expect(repo.tentativas).toBe(2);
  });

  it("erro de NEGÓCIO (medidor desativado): status erro + ack, sem nova tentativa", async () => {
    const repo = new RepoFalso();
    repo.ativo = false;
    expect(await new PedidoHandler(repo, gerador, 0).processar(msg(), 1)).toBe("ack");
    expect(repo.status).toBe("erro");
    expect(repo.erro).toMatch(/desativado/);
  });

  it("falha TÉCNICA simulada: reenfileirar", async () => {
    const repo = new RepoFalso();
    expect(await new PedidoHandler(repo, gerador, 0.5, () => 0.1).processar(msg(), 1)).toBe("reenfileirar");
    expect(repo.status).toBe("processando");
  });

  it("banco fora: a exceção sobe (o consumidor faz nack com requeue)", async () => {
    const repo = new RepoFalso();
    repo.falharBanco = true;
    await expect(new PedidoHandler(repo, gerador, 0).processar(msg(), 1)).rejects.toThrow("banco fora");
  });

  it("mensagem malformada ou de relatório inexistente: rejeitar (dead-letter)", async () => {
    const h = new PedidoHandler(new RepoFalso(), gerador, 0);
    expect(await h.processar(Buffer.from("{ruim"), 1)).toBe("rejeitar");
    expect(await h.processar(msg({ relatorioId: "x" }), 1)).toBe("rejeitar");
    const semRelatorio = new RepoFalso();
    semRelatorio.status = null;
    expect(await new PedidoHandler(semRelatorio, gerador, 0).processar(msg(), 1)).toBe("rejeitar");
  });
});

describe("ErroHandler (dead-letter)", () => {
  it("dá estado final 'erro' ao relatório que esgotou as entregas", async () => {
    const repo = new RepoFalso();
    repo.status = "processando";
    await new ErroHandler(repo).processar(msg(), "delivery_limit");
    expect(repo.status).toBe("erro");
    expect(repo.erro).toMatch(/limite de 5 reentregas/);
  });
});

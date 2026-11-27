import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, UnprocessableError } from "../../src/errors/app-error";
import { InMemoryPublisher } from "../../src/messaging/message-publisher";
import { InMemoryRelatorioRepository } from "../../src/repositories/in-memory-relatorio.repository";
import { Reconciliador } from "../../src/services/reconciliador.service";
import { RelatorioService } from "../../src/services/relatorio.service";
import { SequentialIds } from "../helpers";

describe("RelatorioService", () => {
  let repo: InMemoryRelatorioRepository;
  let publisher: InMemoryPublisher;
  let service: RelatorioService;

  beforeEach(() => {
    repo = new InMemoryRelatorioRepository();
    publisher = new InMemoryPublisher();
    service = new RelatorioService(repo, publisher, new SequentialIds());
  });

  it("grava como pendente, publica e marca publicado_em", async () => {
    const { relatorio, repetido } = await service.criar({ medidor: 42, mes: "2026-10" }, "req-1", null);
    expect(repetido).toBe(false);
    expect(relatorio.status).toBe("pendente");
    expect(relatorio.tipo).toBe("residencial");
    expect(relatorio.tarifaKwh).toBe(0.8);
    expect(publisher.publicadas).toEqual([{ versao: 1, relatorioId: relatorio.id, requestId: "req-1" }]);
    expect((await repo.buscarPorId(relatorio.id))?.publicadoEm).not.toBeNull();
  });

  it("com o RabbitMQ fora, ACEITA o pedido e deixa publicado_em vazio (outbox)", async () => {
    publisher.disponivel = false;
    const { relatorio } = await service.criar({ medidor: 42, mes: "2026-10" }, "req-1", null);
    expect(relatorio.status).toBe("pendente");
    expect((await repo.buscarPorId(relatorio.id))?.publicadoEm).toBeNull();
    expect((await repo.contagens()).aguardandoPublicacao).toBe(1);
  });

  it("reconciliador publica os pendentes antigos quando o broker volta", async () => {
    publisher.disponivel = false;
    const { relatorio } = await service.criar({ medidor: 42, mes: "2026-10" }, "req-1", null);
    const reconciliador = new Reconciliador(repo, publisher, 5000, 10);

    expect(await reconciliador.executar()).toBe(0); // broker ainda fora

    publisher.disponivel = true;
    expect(await reconciliador.executar()).toBe(0); // ainda não tem 10 s

    repo.agora = () => new Date(Date.now() + 11_000);
    expect(await reconciliador.executar()).toBe(1);
    expect(publisher.publicadas[0]?.relatorioId).toBe(relatorio.id);
    expect((await repo.contagens()).aguardandoPublicacao).toBe(0);
  });

  it("mesma Idempotency-Key devolve o mesmo relatório e não publica de novo", async () => {
    const a = await service.criar({ medidor: 42, mes: "2026-10" }, "req-1", "chave-12345678");
    const b = await service.criar({ medidor: 42, mes: "2026-10" }, "req-2", "chave-12345678");
    expect(b.repetido).toBe(true);
    expect(b.relatorio.id).toBe(a.relatorio.id);
    expect(publisher.publicadas).toHaveLength(1);
  });

  it("medidor não cadastrado gera 422", async () => {
    await expect(service.criar({ medidor: 999, mes: "2026-10" }, "r", null)).rejects.toBeInstanceOf(UnprocessableError);
  });

  it("id inexistente gera NotFoundError", async () => {
    await expect(service.obter("00000000-0000-4000-8000-999999999999")).rejects.toBeInstanceOf(NotFoundError);
  });
});

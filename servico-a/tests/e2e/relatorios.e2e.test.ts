import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { InMemoryPublisher } from "../../src/messaging/message-publisher";
import { InMemoryRelatorioRepository } from "../../src/repositories/in-memory-relatorio.repository";
import { SequentialIds } from "../helpers";

describe("API (E2E, sem banco e sem broker reais)", () => {
  let publisher: InMemoryPublisher;
  let repo: InMemoryRelatorioRepository;
  let app: ReturnType<typeof createApp>["app"];

  beforeEach(() => {
    publisher = new InMemoryPublisher();
    repo = new InMemoryRelatorioRepository();
    app = createApp({ repository: repo, publisher, filaMonitor: publisher, ids: new SequentialIds() }).app;
  });

  const pedir = (body: object, chave?: string) => {
    const r = request(app).post("/api/relatorios").set("X-Request-Id", "req-teste").send(body);
    return chave ? r.set("Idempotency-Key", chave) : r;
  };

  it("POST: 202 + Location + mensagem publicada", async () => {
    const res = await pedir({ medidor: 42, mes: "2026-10" });
    expect(res.status).toBe(202);
    expect(res.headers.location).toBe(`/api/relatorios/${res.body.id}`);
    expect(res.headers["x-request-id"]).toBe("req-teste");
    expect(res.body).toMatchObject({ status: "pendente", medidor: 42, tipo: "residencial", tarifaKwh: 0.8 });
    expect(publisher.publicadas).toHaveLength(1);
  });

  it("POST repetido com a mesma Idempotency-Key: 200 e o mesmo relatório", async () => {
    const a = await pedir({ medidor: 42, mes: "2026-10" }, "chave-abcdef12");
    const b = await pedir({ medidor: 42, mes: "2026-10" }, "chave-abcdef12");
    expect(a.status).toBe(202);
    expect(b.status).toBe(200);
    expect(b.headers["idempotent-replayed"]).toBe("true");
    expect(b.body.id).toBe(a.body.id);
    expect(repo.itens.size).toBe(1);
  });

  it("POST com RabbitMQ fora ainda responde 202 (pedido fica no outbox)", async () => {
    publisher.disponivel = false;
    const res = await pedir({ medidor: 42, mes: "2026-10" });
    expect(res.status).toBe(202);
    expect(res.body.publicadoEm).toBeNull();
  });

  it("400 detalhado: campos inválidos, campo inesperado, mês futuro, JSON malformado e chave inválida", async () => {
    const r1 = await pedir({ medidor: -1, mes: "10/2026" });
    expect(r1.status).toBe(400);
    expect(r1.body.details.map((d: { field: string }) => d.field).sort()).toEqual(["medidor", "mes"]);

    const r2 = await pedir({ medidor: 1, mes: "2026-10", tarifaKwh: 0.01 });
    expect(r2.status).toBe(400);

    const r3 = await pedir({ medidor: 1, mes: "2999-01" });
    expect(r3.body.details[0].message).toMatch(/futuro/);

    const r4 = await request(app).post("/api/relatorios").set("Content-Type", "application/json").send("{ruim");
    expect(r4.body.error).toBe("JSON malformado");

    const r5 = await pedir({ medidor: 1, mes: "2026-10" }, "x");
    expect(r5.status).toBe(400);
  });

  it("422 para medidor não cadastrado", async () => {
    const res = await pedir({ medidor: 5000, mes: "2026-10" });
    expect(res.status).toBe(422);
  });

  it("GET lista, filtra, busca por id e devolve estatísticas", async () => {
    const criado = await pedir({ medidor: 7, mes: "2026-09" });
    expect((await request(app).get("/api/relatorios?status=pendente")).body).toHaveLength(1);
    expect((await request(app).get(`/api/relatorios/${criado.body.id}`)).body.tipo).toBe("comercial");
    const stats = await request(app).get("/api/relatorios/stats");
    expect(stats.body).toMatchObject({ total: 1, pendentes: 1, aguardandoPublicacao: 0, fila: { conectado: true } });
  });

  it("diferencia recurso inexistente (404), id inválido (400) e rota inexistente (404)", async () => {
    expect((await request(app).get("/api/relatorios/00000000-0000-4000-8000-999999999999")).status).toBe(404);
    expect((await request(app).get("/api/relatorios/abc")).status).toBe(400);
    expect((await request(app).get("/api/nada")).status).toBe(404);
  });

  it("health: live não depende do banco; ready depende", async () => {
    repo.falharPing = true;
    expect((await request(app).get("/api/health/live")).status).toBe(200);
    expect((await request(app).get("/api/health/ready")).status).toBe(503);
    repo.falharPing = false;
    expect((await request(app).get("/api/health/ready")).status).toBe(200);
  });
});

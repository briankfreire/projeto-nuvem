import { describe, expect, it } from "vitest";
import { RelatorioMapper, type RelatorioRow } from "../../src/mappers/relatorio.mapper";

const row: RelatorioRow = {
  id: "00000000-0000-4000-8000-000000000001",
  request_id: "req-1",
  medidor_id: 42,
  mes: "2026-10",
  tipo: "residencial",
  tarifa_kwh: "0.8000",
  status: "concluido",
  criado_em: new Date("2026-10-28T12:00:00.000Z"),
  atualizado_em: new Date("2026-10-28T12:00:02.000Z"),
  publicado_em: new Date("2026-10-28T12:00:00.010Z"),
  iniciado_em: new Date("2026-10-28T12:00:00.100Z"),
  concluido_em: new Date("2026-10-28T12:00:02.000Z"),
  processado_por: "servico-b-1",
  tentativas: 1,
  erro: null,
  consumo_total_kwh: "312.40",
  custo_estimado: "249.92",
  media_diaria_kwh: "10.08",
  pico_kw: "4.80",
  pico_em: new Date("2026-10-14T19:32:00.000Z"),
  consumo_diario_kwh: ["10.10", "9.80"],
  leituras: 44640,
  duracao_ms: 1500,
};

describe("RelatorioMapper", () => {
  it("converte NUMERIC (texto do driver) em número só no mapper", () => {
    const r = RelatorioMapper.fromRow(row);
    expect(r.tarifaKwh).toBe(0.8);
    expect(r.resultado?.custoEstimado).toBe(249.92);
    expect(r.resultado?.consumoDiarioKwh).toEqual([10.1, 9.8]);
  });

  it("monta a resposta com datas em ISO 8601", () => {
    const dto = RelatorioMapper.toResponse(RelatorioMapper.fromRow(row));
    expect(dto.criadoEm).toBe("2026-10-28T12:00:00.000Z");
    expect(dto.resultado?.picoEm).toBe("2026-10-14T19:32:00.000Z");
  });

  it("relatório não concluído não tem resultado", () => {
    expect(RelatorioMapper.fromRow({ ...row, status: "processando" }).resultado).toBeNull();
  });
});

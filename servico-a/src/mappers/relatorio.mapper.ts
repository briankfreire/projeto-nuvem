import type { Relatorio, StatusRelatorio, TipoConsumidor } from "../domain/relatorio.entity";
import type { RelatorioResponseDto } from "../dtos/relatorio-response.dto";

/** Linha da tabela "relatorio" como o driver pg devolve (NUMERIC chega como texto). */
export interface RelatorioRow {
  id: string;
  request_id: string;
  medidor_id: number;
  mes: string;
  tipo: string;
  tarifa_kwh: string;
  status: string;
  criado_em: Date;
  atualizado_em: Date;
  publicado_em: Date | null;
  iniciado_em: Date | null;
  concluido_em: Date | null;
  processado_por: string | null;
  tentativas: number;
  erro: string | null;
  consumo_total_kwh: string | null;
  custo_estimado: string | null;
  media_diaria_kwh: string | null;
  pico_kw: string | null;
  pico_em: Date | null;
  consumo_diario_kwh: string[] | null;
  leituras: number | null;
  duracao_ms: number | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * Conversões entre linha do banco, entidade e resposta da API.
 * É aqui (e só aqui) que NUMERIC vira number: os valores deste domínio são
 * pequenos (kWh e reais com 2 casas), bem dentro da precisão segura do JavaScript.
 */
export const RelatorioMapper = {
  fromRow(r: RelatorioRow): Relatorio {
    return {
      id: r.id,
      requestId: r.request_id,
      medidor: r.medidor_id,
      mes: r.mes,
      tipo: r.tipo as TipoConsumidor,
      tarifaKwh: Number(r.tarifa_kwh),
      status: r.status as StatusRelatorio,
      criadoEm: r.criado_em,
      atualizadoEm: r.atualizado_em,
      publicadoEm: r.publicado_em,
      iniciadoEm: r.iniciado_em,
      concluidoEm: r.concluido_em,
      processadoPor: r.processado_por,
      tentativas: r.tentativas,
      erro: r.erro,
      resultado:
        r.status === "concluido" && r.consumo_total_kwh !== null
          ? {
              consumoTotalKwh: Number(r.consumo_total_kwh),
              custoEstimado: Number(r.custo_estimado),
              mediaDiariaKwh: Number(r.media_diaria_kwh),
              picoKw: Number(r.pico_kw),
              picoEm: r.pico_em!,
              consumoDiarioKwh: (r.consumo_diario_kwh ?? []).map(Number),
              leituras: r.leituras ?? 0,
              duracaoMs: r.duracao_ms ?? 0,
            }
          : null,
    };
  },

  toResponse(r: Relatorio): RelatorioResponseDto {
    return {
      id: r.id,
      requestId: r.requestId,
      medidor: r.medidor,
      mes: r.mes,
      tipo: r.tipo,
      tarifaKwh: r.tarifaKwh,
      status: r.status,
      criadoEm: r.criadoEm.toISOString(),
      atualizadoEm: r.atualizadoEm.toISOString(),
      publicadoEm: iso(r.publicadoEm),
      iniciadoEm: iso(r.iniciadoEm),
      concluidoEm: iso(r.concluidoEm),
      processadoPor: r.processadoPor,
      tentativas: r.tentativas,
      erro: r.erro,
      resultado: r.resultado
        ? {
            ...r.resultado,
            picoEm: r.resultado.picoEm.toISOString(),
            consumoDiarioKwh: [...r.resultado.consumoDiarioKwh],
          }
        : null,
    };
  },
};

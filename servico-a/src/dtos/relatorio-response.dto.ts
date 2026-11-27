import type { StatusRelatorio, TipoConsumidor } from "../domain/relatorio.entity";

/** Formato público do relatório na API (datas em texto ISO 8601). */
export interface RelatorioResponseDto {
  id: string;
  requestId: string;
  medidor: number;
  mes: string;
  tipo: TipoConsumidor;
  tarifaKwh: number;
  status: StatusRelatorio;
  criadoEm: string;
  atualizadoEm: string;
  publicadoEm: string | null;
  iniciadoEm: string | null;
  concluidoEm: string | null;
  processadoPor: string | null;
  tentativas: number;
  erro: string | null;
  resultado: {
    consumoTotalKwh: number;
    custoEstimado: number;
    mediaDiariaKwh: number;
    picoKw: number;
    picoEm: string;
    consumoDiarioKwh: number[];
    leituras: number;
    duracaoMs: number;
  } | null;
}

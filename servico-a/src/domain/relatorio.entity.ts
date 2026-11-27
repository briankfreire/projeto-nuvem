/**
 * Entidade interna. Usa Date para datas e number para valores já convertidos
 * (diferente do banco, que guarda NUMERIC, e dos DTOs, que usam texto ISO para datas).
 */
export const STATUS_RELATORIO = ["pendente", "processando", "concluido", "erro"] as const;
export const TIPOS_CONSUMIDOR = ["residencial", "comercial", "industrial"] as const;

export type StatusRelatorio = (typeof STATUS_RELATORIO)[number];
export type TipoConsumidor = (typeof TIPOS_CONSUMIDOR)[number];

export interface ResultadoRelatorio {
  consumoTotalKwh: number;
  custoEstimado: number;
  mediaDiariaKwh: number;
  picoKw: number;
  picoEm: Date;
  consumoDiarioKwh: number[];
  leituras: number;
  duracaoMs: number;
}

export interface Relatorio {
  id: string;
  requestId: string;
  medidor: number;
  mes: string; // AAAA-MM
  tipo: TipoConsumidor; // copiado do medidor no momento do pedido
  tarifaKwh: number; // copiada da tabela de tarifas no momento do pedido
  status: StatusRelatorio;
  criadoEm: Date;
  atualizadoEm: Date;
  /** Outbox: null enquanto o RabbitMQ não confirmou a mensagem. */
  publicadoEm: Date | null;
  iniciadoEm: Date | null;
  concluidoEm: Date | null;
  processadoPor: string | null;
  tentativas: number;
  erro: string | null;
  resultado: ResultadoRelatorio | null;
}

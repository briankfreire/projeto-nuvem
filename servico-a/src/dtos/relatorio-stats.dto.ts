/** Contagens calculadas no banco. */
export interface ContagensDto {
  total: number;
  pendentes: number;
  processando: number;
  concluidos: number;
  erros: number;
  /** Pedidos gravados no banco cuja mensagem ainda não foi confirmada pelo RabbitMQ (outbox). */
  aguardandoPublicacao: number;
  tempoMedioProcessamentoMs: number | null;
  tempoMedioTotalMs: number | null;
}

export interface EstadoFilaDto {
  conectado: boolean;
  /** Mensagens "Ready" aguardando um worker. */
  mensagens: number | null;
  /** Workers (instâncias do Serviço B) consumindo a fila. */
  consumidores: number | null;
}

export interface RelatorioStatsDto extends ContagensDto {
  fila: EstadoFilaDto;
}

export type TipoConsumidor = "residencial" | "comercial" | "industrial";

/**
 * Resultado calculado pelo worker a partir das leituras do mês.
 * O CUSTO não é calculado aqui: o banco calcula consumo x tarifa em NUMERIC
 * (sem erro de arredondamento de ponto flutuante).
 */
export interface ResultadoConsumo {
  consumoTotalKwh: number;
  mediaDiariaKwh: number;
  picoKw: number;
  picoEm: Date;
  consumoDiarioKwh: number[];
  leituras: number;
  duracaoMs: number;
}

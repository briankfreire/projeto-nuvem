import type { ResultadoConsumo, TipoConsumidor } from "../domain/relatorio";

export type Reserva =
  | { tipo: "inexistente" }
  | { tipo: "finalizado"; status: "concluido" | "erro" }
  | {
      tipo: "reservado";
      medidor: number;
      mes: string;
      tipoConsumidor: TipoConsumidor;
      medidorAtivo: boolean;
      tentativa: number;
    };

/** Operações do worker sobre o estado do relatório (no PostgreSQL). */
export interface RelatorioRepository {
  /** Marca como "processando" (se ainda não estiver finalizado) e devolve os dados para gerar. */
  reservar(id: string, instancia: string): Promise<Reserva>;
  /** Grava o resultado e o status final NUMA transação. false = outra cópia já finalizou. */
  concluir(id: string, instancia: string, r: ResultadoConsumo): Promise<boolean>;
  /** Estado final "erro" (erro de negócio ou dead-letter). false = já estava finalizado. */
  marcarErro(id: string, motivo: string, instancia: string | null): Promise<boolean>;
}

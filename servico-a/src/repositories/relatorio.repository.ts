import type { Relatorio } from "../domain/relatorio.entity";
import type { ContagensDto } from "../dtos/relatorio-stats.dto";
import type { ListRelatoriosQueryDto } from "../dtos/list-relatorios-query.dto";

export interface NovoRelatorio {
  id: string;
  requestId: string;
  medidor: number;
  mes: string;
  idempotencyKey: string | null;
}

export interface ResultadoCriacao {
  relatorio: Relatorio;
  /** true quando a Idempotency-Key já existia: nada foi criado, este é o relatório anterior. */
  existente: boolean;
}

/**
 * Contrato de persistência. O service depende só desta interface:
 * em produção a implementação é PostgreSQL; nos testes, em memória.
 */
export interface RelatorioRepository {
  /** Cria o relatório "pendente" (ou devolve o existente da mesma Idempotency-Key). */
  criar(novo: NovoRelatorio): Promise<ResultadoCriacao>;
  /** Outbox: marca que o RabbitMQ confirmou a mensagem deste relatório. */
  marcarPublicado(id: string): Promise<void>;
  /**
   * Reconciliador: trava (FOR UPDATE SKIP LOCKED) até `limite` relatórios pendentes,
   * com mais de `idadeSegundos`, ainda não publicados, e chama `publicar` para cada um.
   * Os que `publicar` confirmar (true) são marcados como publicados.
   */
  reconciliarNaoPublicados(
    idadeSegundos: number,
    limite: number,
    publicar: (r: Relatorio) => Promise<boolean>,
  ): Promise<number>;
  buscarPorId(id: string): Promise<Relatorio | null>;
  listar(filtro: ListRelatoriosQueryDto): Promise<Relatorio[]>;
  contagens(): Promise<ContagensDto>;
  /** Verifica se o banco responde (readiness). */
  ping(): Promise<void>;
}

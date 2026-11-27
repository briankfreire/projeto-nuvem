import { Pool } from "pg";
import type { Config } from "../config/config";
import { logger } from "../shared/logger";

/*
 * O driver devolve NUMERIC e BIGINT como TEXTO, porque podem passar da precisão
 * segura do número do JavaScript. Mantemos assim de propósito: a conversão para
 * número acontece de forma controlada só no mapper, na hora de montar a resposta.
 */

/**
 * Pool com tamanho LIMITADO: no máximo DB_POOL_MAX (10) conexões por réplica.
 * Ao escalar o Serviço A, a soma de conexões continua previsível e não esgota
 * o max_connections do PostgreSQL.
 */
export function criarPool(cfg: Config): Pool {
  const pool = new Pool({
    host: cfg.DB_HOST,
    port: cfg.DB_PORT,
    database: cfg.DB_NAME,
    user: cfg.APP_DB_USER,
    password: cfg.APP_DB_PASSWORD,
    max: cfg.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "servico-a",
  });
  // erro numa conexão ociosa (ex.: banco reiniciou): o pool descarta e cria outra
  pool.on("error", (err) => logger.warn({ evento: "db.erro_conexao_ociosa", erro: err.message }));
  return pool;
}

import { Pool } from "pg";
import type { Config } from "../config/config";
import { logger } from "../shared/logger";

/**
 * Pool LIMITADO a 5 conexões por worker. Com o HPA criando até 5 réplicas,
 * o máximo fica em 25 conexões: previsível e bem abaixo do max_connections (100).
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
    application_name: "servico-b",
  });
  pool.on("error", (err) => logger.warn({ evento: "db.erro_conexao_ociosa", erro: err.message }));
  return pool;
}

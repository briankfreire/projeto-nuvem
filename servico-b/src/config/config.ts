import { z } from "zod";

/** Configuração só por variáveis de ambiente; encerra na partida se faltar algo essencial. */
const schema = z.object({
  DB_HOST: z.string().min(1, "DB_HOST é obrigatório"),
  DB_PORT: z.coerce.number().int().default(5432),
  DB_NAME: z.string().min(1, "DB_NAME é obrigatório"),
  APP_DB_USER: z.string().min(1, "APP_DB_USER é obrigatório"),
  APP_DB_PASSWORD: z.string().min(1, "APP_DB_PASSWORD é obrigatório"),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(5),

  RABBITMQ_HOST: z.string().min(1, "RABBITMQ_HOST é obrigatório"),
  RABBITMQ_PORT: z.coerce.number().int().default(5672),
  RABBITMQ_USER: z.string().min(1, "RABBITMQ_USER é obrigatório"),
  RABBITMQ_PASSWORD: z.string().min(1, "RABBITMQ_PASSWORD é obrigatório"),
  RABBITMQ_VHOST: z.string().min(1).default("wattreport"),

  /** Tempo de CPU gasto por relatório (simula processamento pesado; necessário para o HPA). */
  TRABALHO_CPU_MS: z.coerce.number().int().min(0).default(1500),
  /** Probabilidade (0 a 1) de uma FALHA TÉCNICA artificial, para os experimentos de reentrega. */
  TAXA_FALHA_SIMULADA: z.coerce.number().min(0).max(1).default(0),
  HEALTH_PORT: z.coerce.number().int().default(8081),
});

export type Config = z.infer<typeof schema>;

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = schema.safeParse(env);
  if (!r.success) {
    const faltando = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    console.error(JSON.stringify({ nivel: "fatal", evento: "config.invalida", msg: faltando }));
    process.exit(1);
  }
  return r.data;
}

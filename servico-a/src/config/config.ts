import { z } from "zod";

/**
 * Configuração vinda SOMENTE de variáveis de ambiente (nada fixo no código).
 * Se faltar algo essencial, o serviço encerra NA PARTIDA com uma mensagem clara,
 * em vez de falhar mais tarde, no meio de uma requisição.
 */
const schema = z.object({
  PORT: z.coerce.number().int().default(3000),

  DB_HOST: z.string().min(1, "DB_HOST é obrigatório"),
  DB_PORT: z.coerce.number().int().default(5432),
  DB_NAME: z.string().min(1, "DB_NAME é obrigatório"),
  APP_DB_USER: z.string().min(1, "APP_DB_USER é obrigatório"),
  APP_DB_PASSWORD: z.string().min(1, "APP_DB_PASSWORD é obrigatório"),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),

  RABBITMQ_HOST: z.string().min(1, "RABBITMQ_HOST é obrigatório"),
  RABBITMQ_PORT: z.coerce.number().int().default(5672),
  RABBITMQ_USER: z.string().min(1, "RABBITMQ_USER é obrigatório"),
  RABBITMQ_PASSWORD: z.string().min(1, "RABBITMQ_PASSWORD é obrigatório"),
  RABBITMQ_VHOST: z.string().min(1).default("wattreport"),

  RECONCILIADOR_INTERVALO_MS: z.coerce.number().int().min(500).default(5000),
  RECONCILIADOR_IDADE_S: z.coerce.number().int().min(1).default(10),
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

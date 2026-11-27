import { z } from "zod";
import { medidorSchema, mesSchema } from "./common";

/**
 * O cliente envia APENAS o medidor e o mês.
 * Tipo de consumidor e tarifa vêm do banco (o cliente não controla o valor cobrado);
 * id, status e datas são controlados pelo servidor.
 *
 * .strict(): campos inesperados são rejeitados (ex.: tentar mandar "tarifaKwh").
 */
export const createRelatorioSchema = z
  .object({
    medidor: medidorSchema,
    mes: mesSchema,
  })
  .strict();

export type CreateRelatorioDto = z.infer<typeof createRelatorioSchema>;

/**
 * Cabeçalho Idempotency-Key (opcional): uma chave única gerada pelo cliente
 * para cada pedido. Se o mesmo POST for repetido (ex.: timeout e nova tentativa),
 * a API devolve o relatório já criado em vez de criar outro.
 */
export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,128}$/, "Idempotency-Key deve ter de 8 a 128 caracteres (letras, números, - ou _)")
  .optional();

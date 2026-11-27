import { z } from "zod";
import { STATUS_RELATORIO } from "../domain/relatorio.entity";

export const medidorSchema = z.coerce
  .number({ error: "medidor deve ser um número" })
  .int("medidor deve ser inteiro")
  .min(1, "medidor deve ser >= 1")
  .max(999_999, "medidor deve ser <= 999999");

const mesAtual = () => new Date().toISOString().slice(0, 7);

export const mesSchema = z
  .string({ error: "mes é obrigatório" })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "mes deve estar no formato AAAA-MM", abort: true })
  .refine((m) => m >= "2000-01", "mes deve ser a partir de 2000-01")
  .refine((m) => m <= mesAtual(), "mes não pode ser futuro");

export const statusSchema = z.enum(STATUS_RELATORIO, {
  error: `status deve ser um de: ${STATUS_RELATORIO.join(", ")}`,
});

import { z } from "zod";
import { medidorSchema, statusSchema } from "./common";

export const listRelatoriosQuerySchema = z.object({
  status: statusSchema.optional(),
  medidor: medidorSchema.optional(),
  limite: z.coerce.number().int().min(1).max(500).default(50),
});

export type ListRelatoriosQueryDto = z.infer<typeof listRelatoriosQuerySchema>;

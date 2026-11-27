import { z } from "zod";

export const relatorioIdParamsSchema = z.object({
  id: z.uuid("id deve ser um UUID válido"),
});

export type RelatorioIdParamsDto = z.infer<typeof relatorioIdParamsSchema>;

import { randomUUID } from "node:crypto";

/** Abstração da geração de identificadores: permite ids previsíveis nos testes. */
export interface IdGenerator {
  next(): string;
}

export const uuidGenerator: IdGenerator = {
  next: () => randomUUID(),
};

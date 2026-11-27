/** Abstração do relógio: permite controlar o "agora" nos testes. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

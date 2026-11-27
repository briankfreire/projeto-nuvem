/** Erro de aplicação: condição conhecida, com status HTTP associado. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Recurso") {
    super(404, `${resource} não encontrado(a)`);
  }
}

/** A requisição é válida no formato, mas impossível de atender (ex.: medidor inexistente). */
export class UnprocessableError extends AppError {
  constructor(message: string) {
    super(422, message);
  }
}

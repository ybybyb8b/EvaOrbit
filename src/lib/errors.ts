export class ExternalApiError extends Error {}
export class ConflictError extends Error {}
export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type ProviderRequestErrorInput = {
  provider: string;
  message: string;
  statusCode?: number | null;
  requestId?: string | null;
  retryAfterSeconds?: number | null;
};

export class ProviderRequestError extends Error {
  readonly provider: string;
  readonly statusCode: number | null;
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(input: ProviderRequestErrorInput) {
    super(input.message);
    this.name = "ProviderRequestError";
    this.provider = input.provider;
    this.statusCode = input.statusCode ?? null;
    this.requestId = input.requestId ?? null;
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
  }
}

export function isProviderRequestError(
  error: unknown
): error is ProviderRequestError {
  return error instanceof ProviderRequestError;
}

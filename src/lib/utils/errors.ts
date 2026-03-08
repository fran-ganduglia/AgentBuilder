export type AppErrorType =
  | "validation"
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "plan_limit"
  | "internal";

const STATUS_MAP: Record<AppErrorType, number> = {
  validation: 400,
  not_found: 404,
  unauthorized: 401,
  forbidden: 403,
  rate_limited: 429,
  plan_limit: 429,
  internal: 500,
};

export class AppError extends Error {
  readonly statusCode: number;
  readonly type: AppErrorType;

  constructor(type: AppErrorType, message: string) {
    super(message);
    this.name = "AppError";
    this.type = type;
    this.statusCode = STATUS_MAP[type];
  }
}

export function createAppError(type: AppErrorType, message: string): AppError {
  return new AppError(type, message);
}

export function toErrorResponse(error: unknown): {
  body: { error: string };
  status: number;
} {
  if (error instanceof AppError) {
    return { body: { error: error.message }, status: error.statusCode };
  }

  return { body: { error: "Error interno del servidor" }, status: 500 };
}

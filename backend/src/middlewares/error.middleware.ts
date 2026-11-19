import { Request, Response, NextFunction } from "express";

type ErrorRecord = {
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  type?: unknown;
  message?: unknown;
  name?: unknown;
};

export const getHttpErrorStatus = (error: unknown): number => {
  const record =
    error && typeof error === "object"
      ? (error as ErrorRecord)
      : null;

  const code = typeof record?.code === "string" ? record.code : "";
  const type = typeof record?.type === "string" ? record.type : "";
  const name = typeof record?.name === "string" ? record.name : "";

  // Body-parser / Express request parsing errors.
  if (code === "CORS_ORIGIN_DENIED") return 403;
  if (type === "entity.parse.failed" || code === "entity.parse.failed") return 400;
  if (type === "entity.too.large" || code === "entity.too.large") return 413;

  // A database connection problem is a dependency outage, not a client error.
  if (
    name === "PrismaClientInitializationError" ||
    code === "P1001" ||
    code === "P1002"
  ) {
    return 503;
  }

  const candidate =
    typeof record?.statusCode === "number"
      ? record.statusCode
      : typeof record?.status === "number"
        ? record.status
        : null;

  return candidate !== null && candidate >= 400 && candidate <= 599
    ? candidate
    : 500;
};

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error && typeof error === "object"
          ? (() => {
              const record = error as Record<string, unknown>;
              const nested =
                record.error && typeof record.error === "object"
                  ? (record.error as Record<string, unknown>)
                  : null;
              return (
                (typeof nested?.description === "string" && nested.description) ||
                (typeof record.description === "string" && record.description) ||
                (typeof record.message === "string" && record.message) ||
                "Unknown server error"
              );
            })()
          : "Unknown server error";

  console.error("Unhandled API error:", {
    message,
    name: error instanceof Error ? error.name : undefined,
    code:
      error && typeof error === "object" && "code" in error
        ? (error as { code?: unknown }).code
        : undefined,
    stack: error instanceof Error ? error.stack : undefined,
  });

  if (res.headersSent) {
    return next(error);
  }

  const status = getHttpErrorStatus(error);
  const publicMessages: Record<number, string> = {
    400: "Invalid request body",
    403: "Request origin is not allowed",
    413: "Request body is too large",
    503: "A required service is temporarily unavailable",
  };

  return res.status(status).json({
    success: false,
    message: publicMessages[status] ?? "Internal server error",
  });
};

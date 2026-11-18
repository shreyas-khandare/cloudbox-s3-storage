import { Request, Response, NextFunction } from "express";

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
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
    stack: error instanceof Error ? error.stack : undefined,
  });

  if (res.headersSent) {
    return;
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

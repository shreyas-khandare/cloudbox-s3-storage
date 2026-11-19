import { Response } from "express";

type DependencyError = {
  code?: unknown;
  Code?: unknown;
  name?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  $metadata?: { httpStatusCode?: unknown };
};

export const getDependencyFailure = (error: unknown) => {
  const record =
    error && typeof error === "object"
      ? (error as DependencyError)
      : null;

  const code =
    typeof record?.code === "string"
      ? record.code
      : typeof record?.Code === "string"
        ? record.Code
        : "";
  const name = typeof record?.name === "string" ? record.name : "";
  const providerStatus =
    typeof record?.$metadata?.httpStatusCode === "number"
      ? record.$metadata.httpStatusCode
      : typeof record?.statusCode === "number"
        ? record.statusCode
        : typeof record?.status === "number"
          ? record.status
          : null;

  if (code === "STORAGE_LIMIT_EXCEEDED" || message === "STORAGE_LIMIT_EXCEEDED") {
    return { status: 409, message: "Storage limit exceeded" };
  }

  if (code === "P2002") {
    return { status: 409, message: "This file has already been saved" };
  }

  if (code === "P2025") {
    return { status: 404, message: "The requested record was not found" };
  }

  if (
    code === "NoSuchKey" ||
    code === "NotFound" ||
    name === "NotFound" ||
    providerStatus === 404
  ) {
    return { status: 404, message: "The file object was not found in storage" };
  }

  if (
    name === "PrismaClientInitializationError" ||
    code === "P1001" ||
    code === "P1002" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "EAI_AGAIN" ||
    code === "ENETUNREACH" ||
    name === "TimeoutError" ||
    providerStatus === 429 ||
    (providerStatus !== null && providerStatus >= 500)
  ) {
    return { status: 503, message: "Storage or database service is temporarily unavailable. Please retry." };
  }

  if (
    code === "AccessDenied" ||
    code === "InvalidAccessKeyId" ||
    code === "SignatureDoesNotMatch"
  ) {
    return { status: 503, message: "Cloud storage is temporarily unavailable. Please contact support if the issue persists." };
  }

  return { status: 500, message: "The file operation could not be completed." };
};

export const sendDependencyError = (
  res: Response,
  error: unknown,
  operation: string
) => {
  const failure = getDependencyFailure(error);

  console.error(`[File API] ${operation} failed:`, {
    name: error instanceof Error ? error.name : undefined,
    code:
      error && typeof error === "object" && "code" in error
        ? (error as { code?: unknown }).code
        : undefined,
    message: error instanceof Error ? error.message : "Unknown error",
    status: failure.status,
  });

  return res.status(failure.status).json({
    success: false,
    message: failure.message,
  });
};

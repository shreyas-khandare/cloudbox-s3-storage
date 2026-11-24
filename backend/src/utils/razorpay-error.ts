/**
 * A 4xx HTTP response is an explicit provider rejection. Timeouts, transport
 * failures and 5xx responses are ambiguous because the provider may have
 * completed the operation before the response was lost.
 */
export const isDefinitiveRazorpayRejection = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;

  const record = error as Record<string, unknown>;
  const response =
    typeof record.response === "object" && record.response !== null
      ? (record.response as Record<string, unknown>)
      : null;
  const statusCode =
    typeof record.statusCode === "number"
      ? record.statusCode
      : typeof response?.status === "number"
        ? response.status
        : null;

  return statusCode !== null && statusCode >= 400 && statusCode < 500;
};

import axios from "axios";

export const getApiErrorMessage = (
  error: unknown,
  fallback = "Something went wrong. Please try again."
): string => {
  if (axios.isAxiosError(error)) {
    const serverMessage = error.response?.data?.message;
    if (typeof serverMessage === "string" && serverMessage.trim()) {
      return serverMessage;
    }

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return "The request timed out. Please try again.";
    }

    if (!error.response) {
      return "Unable to reach CloudBox. Check your internet connection and try again.";
    }

    if (error.response.status === 429) {
      return "Too many requests. Please wait a moment and try again.";
    }

    if (error.response.status >= 500) {
      return "CloudBox is temporarily unavailable. Please try again shortly.";
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

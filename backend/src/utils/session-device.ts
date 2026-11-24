import { randomBytes } from "node:crypto";
import { Request, Response } from "express";
import { env } from "../config/env";

export const DEVICE_ID_COOKIE = "device_id";
export const DEVICE_ID_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export const isValidDeviceId = (value: unknown): value is string => {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
};

export const setDeviceIdCookie = (res: Response, deviceId: string): void => {
  const isProduction = env.NODE_ENV === "production";

  res.cookie(DEVICE_ID_COOKIE, deviceId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: DEVICE_ID_MAX_AGE_MS,
    path: "/",
  });
};

// The ID identifies a browser profile only; it is never an authentication token.
export const getOrCreateDeviceId = (req: Request, res: Response): string => {
  const existingDeviceId = req.cookies?.[DEVICE_ID_COOKIE];

  if (isValidDeviceId(existingDeviceId)) {
    return existingDeviceId.toLowerCase();
  }

  const deviceId = randomBytes(32).toString("hex");
  setDeviceIdCookie(res, deviceId);
  return deviceId;
};

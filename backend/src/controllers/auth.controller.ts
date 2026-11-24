
import { Request, Response } from "express";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { OAuth2Client } from "google-auth-library";
import prisma from "../config/prisma";
import { createSession, revokeSession } from "../services/session.service";
import { generateAndSendOTP, verifyOTP } from "../services/otp.service";
import { env } from "../config/env";
import {
  isServiceUnavailable,
  isUniqueConstraintViolation,
} from "../utils/dependency-error";

const googleClient = new OAuth2Client(env.GOOGLE.CLIENT_ID);

const DEVICE_ID_COOKIE = "device_id";
const DEVICE_ID_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const DEVICE_ID_PATTERN = /^[a-f0-9]{64}$/i;

// This opaque, non-authentication cookie identifies a browser profile across
// logins. It is intentionally retained on logout so the same profile reuses
// its existing device slot the next time the user signs in.
const getOrCreateDeviceId = (req: Request, res: Response): string => {
    const existingDeviceId = req.cookies?.[DEVICE_ID_COOKIE];

    if (
        typeof existingDeviceId === "string" &&
        DEVICE_ID_PATTERN.test(existingDeviceId)
    ) {
        return existingDeviceId.toLowerCase();
    }

    const deviceId = randomBytes(32).toString("hex");
    const isProduction = env.NODE_ENV === "production";

    res.cookie(DEVICE_ID_COOKIE, deviceId, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: DEVICE_ID_MAX_AGE_MS,
        path: "/",
    });

    return deviceId;
};

const setSessionCookie = (
    res: Response,
    token: string,
    maxAge: number,
) => {
    const isProduction = env.NODE_ENV === "production";

    res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge,
        path: "/",
    });
};

const sendSafeUser = (res: Response, user: any, status = 200) => {
  const { password: _password, ...safeUser } = user;

  return res.status(status).json({
    user: {
      ...safeUser,
      storageUsed: user.storageUsed.toString(),
      storageLimit: user.storageLimit.toString(),
    },
  });
};

// Step 1: Request an OTP. Do not create the user yet.
export const sendRegistrationOTP = async (
  req: Request,
  res: Response,
) => {
  try {
    const { email } = req.body;

    if (
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return res.status(400).json({
        message: "Provide a valid email address.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Unable to register with this email.",
      });
    }

    await generateAndSendOTP(normalizedEmail);

    return res.status(200).json({
      message: "If this address can be registered, a verification code has been sent.",
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("wait before requesting")
    ) {
      return res.status(429).json({ message: error.message });
    }

    console.error("[Auth] Registration OTP failed:", error);
    return res.status(503).json({
      message: "Unable to send a verification code. Please try again later.",
    });
  }
};

// Step 2: Verify the OTP and grant a short registration window.
export const verifyRegistrationOTP = async (
  req: Request,
  res: Response,
) => {
  try {
    const { email, otp } = req.body;

    if (
      typeof email !== "string" ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp)
    ) {
      return res.status(400).json({
        message: "Provide a valid email and six-digit verification code.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Unable to register with this email.",
      });
    }

    const isValid = await verifyOTP(normalizedEmail, otp);

    if (!isValid) {
      return res.status(400).json({
        message: "Invalid or expired verification code.",
      });
    }

    return res.status(200).json({
      message: "Email verified. Complete registration within 10 minutes.",
    });
  } catch (error) {
    console.error("[Auth] Registration OTP verification failed:", error);
    return res.status(isServiceUnavailable(error) ? 503 : 500).json({
      message: isServiceUnavailable(error)
        ? "Verification service is temporarily unavailable. Please try again."
        : "Unable to verify the code. Please try again.",
    });
  }
};

// Step 3: Create the user only if the email has a valid verification grant.
export const register = async (
  req: Request,
  res: Response,
) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        message:
          "Provide a valid name, email, and password of at least 8 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });

      if (existingUser) {
        throw new Error("EMAIL_ALREADY_REGISTERED");
      }

      const grant = await tx.emailVerificationOTP.findFirst({
        where: {
          email: normalizedEmail,
          verifiedAt: { not: null },
          registrationGrantExpiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!grant) {
        throw new Error("EMAIL_VERIFICATION_REQUIRED");
      }

      const createdUser = await tx.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          password: passwordHash,
          emailVerified: true,
        },
      });

      await tx.emailVerificationOTP.deleteMany({
        where: { email: normalizedEmail },
      });

      return createdUser;
    });

    return res.status(201).json({
      message: "Account created successfully. Please log in.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "EMAIL_ALREADY_REGISTERED") {
        return res.status(409).json({
          message: "Unable to register with this email.",
        });
      }

      if (error.message === "EMAIL_VERIFICATION_REQUIRED") {
        return res.status(403).json({
          message: "Verify your email before creating an account.",
        });
      }
    }

    if (isUniqueConstraintViolation(error)) {
      return res.status(409).json({
        message: "Unable to register with this email.",
      });
    }

    console.error("[Auth] Registration failed:", error);
    return res.status(isServiceUnavailable(error) ? 503 : 500).json({
      message: isServiceUnavailable(error)
        ? "Registration service is temporarily unavailable. Please try again."
        : "Registration failed.",
    });
  }
};

export const login = async (req: Request, res: Response) => {
    try {
        const email =
            typeof req.body.email === "string"
                ? req.body.email.trim().toLowerCase()
                : "";

        const { password } = req.body;

        if (!email || typeof password !== "string") {
            return res.status(400).json({
                message: "Provide a valid email and password.",
            });
        }

        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (
            !user?.password ||
            !(await bcrypt.compare(password, user.password))
        ) {
            return res.status(401).json({
                message: "Invalid credentials",
            });
        }

        if (!user.emailVerified) {
            return res.status(403).json({
                message: "Please verify your email before logging in.",
            });
        }

        const deviceId = getOrCreateDeviceId(req, res);
        const session = await createSession(user.id, deviceId);

        setSessionCookie(res, session.token, session.maxAge);

        return sendSafeUser(res, user);

    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "DEVICE_LIMIT_REACHED"
        ) {
            return res.status(409).json({
                message: "You have reached your device limit. Please sign out from another device before logging in.",
            });
        }

        if (
            error instanceof Error &&
            error.message === "USER_NOT_FOUND"
        ) {
            return res.status(404).json({
                message: "User not found",
            });
        }

        console.error("[Auth] Login failed:", error);

        return res.status(isServiceUnavailable(error) ? 503 : 500).json({
            message: isServiceUnavailable(error)
              ? "Login service is temporarily unavailable. Please try again."
              : "Login failed",
        });
    }
};

// Retained for compatibility with any existing routes or clients.
export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    if (
      typeof email !== "string" ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp)
    ) {
      return res.status(400).json({
        message: "Provide a valid email and six-digit verification code.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const isValid = await verifyOTP(normalizedEmail, otp);

    if (!isValid) {
      return res.status(400).json({
        message: "Invalid or expired verification code.",
      });
    }

    return res.status(200).json({
      message: "Email verified. Complete registration within 10 minutes.",
    });
  } catch (error) {
    console.error("[Auth] Email verification failed:", error);
    return res.status(isServiceUnavailable(error) ? 503 : 500).json({
      message: isServiceUnavailable(error)
        ? "Verification service is temporarily unavailable. Please try again."
        : "Email verification failed. Please try again.",
    });
  }
};

export const resendVerificationOTP = async (
  req: Request,
  res: Response,
) => {
  try {
    const { email } = req.body;

    if (
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return res.status(400).json({
        message: "Provide a valid email address.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { emailVerified: true },
    });

    // Existing resend flow for accounts that already exist.
    if (!user || user.emailVerified) {
      return res.status(200).json({
        message: "If the account requires verification, a code can be sent.",
      });
    }

    await generateAndSendOTP(normalizedEmail);

    return res.status(200).json({
      message: "If the account requires verification, a code has been sent.",
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("wait before requesting")
    ) {
      return res.status(429).json({ message: error.message });
    }

    console.error("[Auth] OTP resend failed:", error);
    return res.status(503).json({
      message: "Unable to send a verification code. Please try again later.",
    });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return sendSafeUser(res, user);
  } catch (error) {
    console.error("[Auth] Fetch user failed:", error);
    return res.status(isServiceUnavailable(error) ? 503 : 500).json({
      message: isServiceUnavailable(error)
        ? "Account service is temporarily unavailable. Please try again."
        : "Failed to fetch user",
    });
  }
};

export const logout = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const token = req.cookies?.token;

    if (typeof token === "string" && token.length > 0) {
      await revokeSession(token);
    }

    // Keep device_id: logging out must not turn this browser profile into a
    // new device when it signs in again.
    res.clearCookie("token", {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("[Auth] Logout failed:", error);

    // Clear the browser cookie even if the database is temporarily unavailable.
    // The response communicates that server-side revocation may need retry/recovery.
    res.clearCookie("token", {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });

    res.status(503).json({
      message: "The local session was cleared, but server-side logout could not be confirmed.",
    });
  }
};

export const googleLogin = async (req: Request, res: Response) => {
    try {
        const { token } = req.body;

        if (typeof token !== "string" || !token) {
            return res.status(400).json({
                message: "A valid Google credential is required.",
            });
        }

        let ticket;
        try {
            ticket = await googleClient.verifyIdToken({
                idToken: token,
                audience: env.GOOGLE.CLIENT_ID,
            });
        } catch (verificationError) {
            if (isServiceUnavailable(verificationError)) {
                console.error("[Auth] Google token verification service unavailable:", verificationError);
                return res.status(503).json({
                    message: "Google sign-in is temporarily unavailable. Please try again.",
                });
            }

            console.warn("[Auth] Google rejected an ID token.");
            return res.status(401).json({
                message: "Google credential is invalid or expired. Please try again.",
            });
        }

        const payload = ticket.getPayload();

        if (!payload?.email || payload.email_verified !== true) {
            return res.status(401).json({
                message: "Google account email is not verified",
            });
        }

        const email = payload.email.trim().toLowerCase();

        let user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    name: payload.name || "",
                    email,
                    avatar: payload.picture,
                    provider: "GOOGLE",
                    emailVerified: true,
                },
            });
        } else if (!user.emailVerified) {
            user = await prisma.user.update({
                where: { id: user.id },
                data: { emailVerified: true },
            });
        }

        const deviceId = getOrCreateDeviceId(req, res);
        const session = await createSession(user.id, deviceId);

        setSessionCookie(res, session.token, session.maxAge);

        return sendSafeUser(res, user);

    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "DEVICE_LIMIT_REACHED"
        ) {
            return res.status(409).json({
                message: "You have reached your device limit. Please sign out from another device before logging in.",
            });
        }

        if (
            error instanceof Error &&
            error.message === "USER_NOT_FOUND"
        ) {
            return res.status(404).json({
                message: "User not found",
            });
        }

        console.error("[Auth] Google login failed:", error);

        return res.status(isServiceUnavailable(error) ? 503 : 500).json({
            message: isServiceUnavailable(error)
              ? "Google sign-in is temporarily unavailable. Please try again."
              : "Google login failed",
        });
    }
};
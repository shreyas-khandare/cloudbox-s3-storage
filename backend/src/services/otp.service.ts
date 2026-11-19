
import { createHash, randomInt } from "node:crypto";
import prisma from "../config/prisma";
import { sendVerificationEmail } from "./email.service";

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const REGISTRATION_GRANT_EXPIRY_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

const hashOTP = (email: string, otp: string): string =>
  createHash("sha256")
    .update(`${email}:${otp}`)
    .digest("hex");

export const generateAndSendOTP = async (
  emailInput: string,
): Promise<void> => {
  const email = emailInput.trim().toLowerCase();
  const now = new Date();

  const otp = randomInt(100000, 1000000).toString();
  const codeHash = hashOTP(email, otp);
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);

  // Serialize OTP requests for one email so parallel requests cannot bypass
  // the resend cooldown and send several valid codes at the same time.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${"otp:" + email}))
    `;

    const recentOTP = await tx.emailVerificationOTP.findFirst({
      where: {
        email,
        createdAt: {
          gt: new Date(now.getTime() - RESEND_COOLDOWN_MS),
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentOTP) {
      throw new Error(
        "Please wait before requesting another verification code.",
      );
    }

    await tx.emailVerificationOTP.create({
      data: {
        email,
        codeHash,
        expiresAt,
      },
    });
  });

  try {
    await sendVerificationEmail(email, otp);
  } catch (error) {
    await prisma.emailVerificationOTP.deleteMany({
      where: { email, codeHash },
    });

    throw error;
  }
};

export const verifyOTP = async (
  emailInput: string,
  otpInput: string,
): Promise<boolean> => {
  const email = emailInput.trim().toLowerCase();
  const otp = otpInput.trim();

  if (!/^\d{6}$/.test(otp)) {
    return false;
  }

  const record = await prisma.emailVerificationOTP.findFirst({
    where: {
      email,
      verifiedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record || record.attempts >= MAX_ATTEMPTS) {
    return false;
  }

  const now = new Date();
  const matches = hashOTP(email, otp) === record.codeHash;

  if (!matches) {
    // Atomic conditional increment prevents concurrent guesses exceeding the
    // configured attempt limit or updating an already-verified OTP.
    await prisma.emailVerificationOTP.updateMany({
      where: {
        id: record.id,
        attempts: { lt: MAX_ATTEMPTS },
        verifiedAt: null,
        expiresAt: { gt: now },
      },
      data: { attempts: { increment: 1 } },
    });

    return false;
  }

  const verifiedAt = now;
  const result = await prisma.emailVerificationOTP.updateMany({
    where: {
      id: record.id,
      codeHash: record.codeHash,
      attempts: { lt: MAX_ATTEMPTS },
      verifiedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      verifiedAt,
      registrationGrantExpiresAt: new Date(
        verifiedAt.getTime() + REGISTRATION_GRANT_EXPIRY_MS,
      ),
    },
  });

  // Only the first concurrent correct attempt can claim the grant.
  return result.count === 1;
};

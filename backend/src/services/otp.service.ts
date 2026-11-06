
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

  const recentOTP = await prisma.emailVerificationOTP.findFirst({
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

  const otp = randomInt(100000, 1000000).toString();
  const codeHash = hashOTP(email, otp);
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);

  await prisma.emailVerificationOTP.create({
    data: {
      email,
      codeHash,
      expiresAt,
    },
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

  const matches = hashOTP(email, otp) === record.codeHash;

  if (!matches) {
    await prisma.emailVerificationOTP.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });

    return false;
  }

  const verifiedAt = new Date();

  await prisma.emailVerificationOTP.update({
    where: { id: record.id },
    data: {
      verifiedAt,
      registrationGrantExpiresAt: new Date(
        verifiedAt.getTime() + REGISTRATION_GRANT_EXPIRY_MS,
      ),
    },
  });

  return true;
};

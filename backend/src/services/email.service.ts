
import { Resend } from "resend";
import { env } from "../config/env";

const resend = new Resend(env.RESEND.API_KEY);

export const sendVerificationEmail = async (
  email: string,
  otp: string,
): Promise<void> => {
  const { error } = await resend.emails.send({
    from: env.RESEND.EMAIL_FROM,
    to: email,
    subject: "Verify your CloudBox account",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2>Verify your CloudBox account</h2>
        <p>Enter the following verification code to complete registration:</p>
        <p style="font-size: 30px; font-weight: bold; letter-spacing: 8px;">
          ${otp}
        </p>
        <p>This code expires in 10 minutes.</p>
        <p>If you didn't create a CloudBox account, you can ignore this email.</p>
      </div>
    `,
  });

  if (error) {
    console.error("[Email Service] Failed to send verification email:", error);
    throw new Error("Unable to send verification email");
  }
};

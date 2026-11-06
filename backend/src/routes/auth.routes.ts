
import express from "express";
import { protect } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { authLimiter } from "../middlewares/rateLimit.middleware";

import { registerSchema, loginSchema} from "../validations/auth.validation";

import {
  register,
  login,
  getMe,
  logout,
  googleLogin,
  sendRegistrationOTP,
  verifyRegistrationOTP,
  verifyEmail,
  resendVerificationOTP,
} from "../controllers/auth.controller";

const router = express.Router();

// Registration and OTP
router.post("/send-registration-otp", authLimiter, sendRegistrationOTP);
router.post("/verify-registration-otp", authLimiter, verifyRegistrationOTP);
router.post("/register", authLimiter, validate(registerSchema), register);

// Email verification
router.post("/verify-email", authLimiter, verifyEmail);
router.post("/resend-verification", authLimiter, resendVerificationOTP);

// Login
router.post("/login", authLimiter, validate(loginSchema), login);

// Google authentication
router.post("/google", authLimiter, googleLogin);

// Protected routes
router.get("/me", protect, getMe);
router.post("/logout", protect, logout);

export default router;
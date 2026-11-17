import { Router } from "express";
import { protect } from "../middlewares/auth.middleware";
import {
  createSubscriptionController,
  getSubscriptionPlansController,
  getMySubscriptionController,
  getPaymentHistoryController,
  cancelSubscriptionController,
} from "../controllers/subscription.controller";

const router = Router();

router.get("/plans", getSubscriptionPlansController);

router.use(protect);

router.get("/me", getMySubscriptionController);
router.get("/payments", getPaymentHistoryController);
router.post("/", createSubscriptionController);
router.post("/cancel", cancelSubscriptionController);

export default router;
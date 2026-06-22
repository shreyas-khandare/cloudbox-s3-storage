import express from "express";
import { protect } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";

import {
    registerSchema,
    loginSchema
} from "../validations/auth.validation";

import {
    register,
    login,
    getMe,
    logout,
    googleLogin
} from "../controllers/auth.controller";


const router = express.Router();


router.post(
    "/register",
    validate(registerSchema),
    register
);


router.post(
    "/login",
    validate(loginSchema),
    login
);

router.get(
    "/me",
    protect,
    getMe
);

router.post(
    "/logout",
    protect,
    logout
);

router.post(
    "/google",
    googleLogin
);

export default router;
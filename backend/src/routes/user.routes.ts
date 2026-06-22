import express from "express";
import { getUsers } from "../controllers/user.controller";
import { protect } from "../middlewares/auth.middleware";

const router = express.Router();

//later remove this
router.get(
    "/",
    protect,
    getUsers
);


export default router;
import express from "express";

import { protect } from "../middlewares/auth.middleware";

import { adminOnly } from "../middlewares/admin.middleware";


import {
    getStats,
    getAdminUsers,
    getAdminFiles
} from "../controllers/admin.controller";


const router =
    express.Router();



router.get(
    "/stats",
    protect,
    adminOnly,
    getStats
);



router.get(
    "/users",
    protect,
    adminOnly,
    getAdminUsers
);



router.get(
    "/files",
    protect,
    adminOnly,
    getAdminFiles
);



export default router;
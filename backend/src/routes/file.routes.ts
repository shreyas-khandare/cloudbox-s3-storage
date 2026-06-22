import express from "express";
import { protect } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";

import {
    uploadUrlSchema,
    saveFileSchema
} from "../validations/file.validation";

import {
    generateUploadUrl,
    saveFile,
    getMyFiles,
    downloadFile,
    deleteFile,
    previewFile
} from "../controllers/file.controller";



const router = express.Router();


router.post(
    "/upload-url",
    protect,
    validate(uploadUrlSchema),
    generateUploadUrl
);

router.post(
    "/save",
    protect,
    validate(saveFileSchema),
    saveFile
);

router.get(
    "/",
    protect,
    getMyFiles
);

router.get(
    "/:id/download",
    protect,
    downloadFile
);

router.delete(
    "/:id",
    protect,
    deleteFile
);

router.get(
    "/:id/preview",
    protect,
    previewFile
);

export default router;

import { z } from "zod";

const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10 GB

export const uploadUrlSchema = z.object({
    fileName: z
        .string()
        .min(1, "File name is required")
        .max(255, "File name must not exceed 255 characters")
        .refine(
            (name) => !name.includes("/") && !name.includes("\\"),
            "File name must not contain path separators"
        ),

    fileType: z
        .string()
        .min(1, "File type is required")
        .max(100, "File type is too long"),

    fileSize: z
        .number()
        .int()
        .positive()
        .max(MAX_FILE_SIZE, "File size must not exceed 10 GB"),
});

export const saveFileSchema = z.object({
    name: z
        .string()
        .min(1, "File name is required")
        .max(255, "File name must not exceed 255 characters"),

    type: z
        .string()
        .min(1, "File type is required")
        .max(100, "File type is too long"),

    size: z
        .number()
        .int()
        .positive()
        .max(MAX_FILE_SIZE, "File size must not exceed 10 GB"),

    s3Key: z
        .string()
        .min(1, "S3 key is required")
        .max(1024, "S3 key is too long"),
});

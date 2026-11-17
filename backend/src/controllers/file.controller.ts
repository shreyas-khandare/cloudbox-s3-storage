import { Request, Response } from "express";
import prisma from "../config/prisma";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { SUBSCRIPTION_PLANS } from "../config/subscription-plans";

import {
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

import { s3 } from "../config/s3";

// A single S3 upload request is limited to 5 GB. Larger files need multipart upload.
const MAX_SINGLE_UPLOAD_SIZE = 5_000_000_000;


// Generate S3 upload URL
export const generateUploadUrl = async (
    req: Request,
    res: Response
) => {
    try {
        const { fileName, fileType, fileSize } = req.body;
        const userId = (req as any).user.id;

        // Validate file size
        if (!Number.isSafeInteger(fileSize) || fileSize <= 0) {
            return res.status(400).json({
                message: "Invalid file size",
            });
        }

        // Get user storage details
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                plan: true,
                storageUsed: true,
                storageLimit: true,
            },
        });

        if (!user) {
            return res.status(404).json({
                message: "User not found",
            });
        }

        // Get the user's plan limits
        const planConfig = SUBSCRIPTION_PLANS[user.plan];

        // Enforce plan-specific maximum file size
        if (fileSize > planConfig.maxFileSize) {
            return res.status(413).json({
                message: `Your ${planConfig.name} plan allows a maximum file size of ${
                    planConfig.maxFileSize / (1024 * 1024)
                } MB`,
            });
        }

        if (fileSize > MAX_SINGLE_UPLOAD_SIZE) {
            return res.status(413).json({
                message: "Files larger than 5 GB require multipart upload, which is not available yet.",
            });
        }

        // Check remaining storage
        const availableStorage = user.storageLimit - user.storageUsed;
        const requestedFileSize = BigInt(fileSize);

        if (availableStorage <= 0n || requestedFileSize > availableStorage) {
            return res.status(409).json({
                message: "Storage limit exceeded",
            });
        }

        // Sanitize the filename
        const safeFileName = fileName.replace(
            /[^a-zA-Z0-9._-]/g,
            "_"
        );

        // Generate a unique S3 key
        const key = `users/${userId}/${randomUUID()}-${safeFileName}`;

        // Generate presigned POST with an exact file-size restriction
        const { url, fields } = await createPresignedPost(s3, {
            Bucket: env.AWS.BUCKET!,
            Key: key,
            Expires: 300,
            Fields: {
                "Content-Type": fileType,
            },
            Conditions: [
                ["content-length-range", fileSize, fileSize],
                ["eq", "$Content-Type", fileType],
            ],
        });

        return res.status(200).json({
            uploadUrl: url,
            fields,
            key,
        });
    } catch (error) {
        console.error("Generate Upload URL Error:", error);

        return res.status(500).json({
            message: "Failed to generate upload URL",
        });
    }
};

// Save file metadata
export const saveFile = async (
    req: Request,
    res: Response
) => {
    const userId = (req as any).user.id;
    const s3Key = req.body.s3Key as string;

    try {
        const { name, type, size } = req.body;

        if (!Number.isSafeInteger(size) || size <= 0) {
            return res.status(400).json({
                message: "Invalid file size",
            });
        }

        if (
            typeof s3Key !== "string" ||
            !s3Key.startsWith(`users/${userId}/`)
        ) {
            return res.status(403).json({
                message: "Invalid file key",
            });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { plan: true },
        });

        if (!user) {
            return res.status(404).json({
                message: "User not found",
            });
        }

        const planConfig = SUBSCRIPTION_PLANS[user.plan];
        const fileSize = BigInt(size);

        if (size > planConfig.maxFileSize) {
            return res.status(413).json({
                message: "File exceeds your plan's maximum file size",
            });
        }

        if (size > MAX_SINGLE_UPLOAD_SIZE) {
            return res.status(413).json({
                message: "Files larger than 5 GB require multipart upload, which is not available yet.",
            });
        }

        const headResult = await s3.send(
            new HeadObjectCommand({
                Bucket: env.AWS.BUCKET,
                Key: s3Key,
            })
        );

        if (
            headResult.ContentLength === undefined ||
            headResult.ContentLength !== size
        ) {
            return res.status(400).json({
                message: "Uploaded file size does not match",
            });
        }

        if (headResult.ContentType !== type) {
            return res.status(400).json({
                message: "Uploaded file type does not match",
            });
        }

        const file = await prisma.$transaction(async (tx) => {
            const quotaUpdated = await tx.$executeRaw`
                UPDATE "User"
                SET "storageUsed" = "storageUsed" + ${fileSize}
                WHERE "id" = ${userId}
                  AND "plan" = ${user.plan}::"Plan"
                  AND "storageUsed" + ${fileSize} <= "storageLimit"
            `;

            if (quotaUpdated !== 1) {
                throw new Error("STORAGE_LIMIT_EXCEEDED");
            }

            return tx.file.create({
                data: {
                    name,
                    type,
                    size: fileSize,
                    s3Key,
                    url: `https://${env.AWS.BUCKET}.s3.${env.AWS.REGION}.amazonaws.com/${s3Key}`,
                    userId,
                },
            });
        });

        return res.status(201).json({
            success: true,
            file: {
                ...file,
                size: file.size.toString(),
            },
        });

    } catch (error) {
        console.error("Save File Error:", error);

        if (
            error instanceof Error &&
            error.message === "STORAGE_LIMIT_EXCEEDED"
        ) {
            return res.status(409).json({
                message: "Storage limit exceeded",
            });
        }

        return res.status(500).json({
            message: "Failed to save file",
        });
    }
};

// Get logged-in user's files
export const getMyFiles = async (
    req: Request,
    res: Response
) => {

    try {


        const userId =
            (req as any).user.id;


        const files =
            await prisma.file.findMany({

                where: {

                    userId

                },


                orderBy: {

                    createdAt: "desc"

                }

            });


        const formattedFiles =
            files.map(file => ({

                ...file,


                size:
                    file.size.toString()

            }));


        res.json({

            success: true,

            files:
                formattedFiles

        });



    } catch (error) {


        console.log(
            "Get Files Error:",
            error
        );


        res.status(500).json({

            message:
                "Failed to get files"

        });


    }

};

// Generate secure download URL
export const downloadFile = async (
    req: Request,
    res: Response
) => {

    try {


        const userId =
            (req as any).user.id;


        const id = req.params.id as string;


        const file =
            await prisma.file.findFirst({

                where: {

                    id,

                    userId

                }

            });


        if (!file) {

            return res.status(404).json({

                message:
                    "File not found"

            });

        }


        const command =
            new GetObjectCommand({

                Bucket:
                    env.AWS.BUCKET,

                Key:
                    file.s3Key,

                ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`

            });


        const downloadUrl =
            await getSignedUrl(

                s3,

                command,

                {
                    expiresIn: 300
                }

            );


        res.json({

            success: true,

            downloadUrl

        });



    } catch (error) {


        console.log(
            "Download Error:",
            error
        );


        res.status(500).json({

            message:
                "Failed to generate download URL"

        });


    }

};

// Delete File for specific user
export const deleteFile = async (
    req: Request,
    res: Response
) => {
    try {
        const userId = (req as any).user.id;
        const id = req.params.id as string;

        // Find file belonging to the logged-in user.
        const file = await prisma.file.findFirst({
            where: {
                id,
                userId,
            },
        });

        if (!file) {
            return res.status(404).json({
                message: "File not found",
            });
        }

        // Delete the S3 object first.
        await s3.send(
            new DeleteObjectCommand({
                Bucket: env.AWS.BUCKET,
                Key: file.s3Key,
            })
        );

        // Delete metadata and update storage atomically.
        const deleted = await prisma.$transaction(async (tx) => {
            const result = await tx.file.deleteMany({
                where: {
                    id: file.id,
                    userId,
                },
            });

            if (result.count !== 1) {
                return false;
            }

            await tx.user.update({
                where: {
                    id: userId,
                },
                data: {
                    storageUsed: {
                        decrement: file.size,
                    },
                },
            });

            return true;
        });

        if (!deleted) {
            return res.status(404).json({
                message: "File not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "File deleted successfully",
        });

    } catch (error) {
        console.error("Delete Error:", error);

        return res.status(500).json({
            message: "Failed to delete file",
        });
    }
};

//Preview File for specific user
export const previewFile = async (
    req: Request,
    res: Response
) => {

    try {

        const id =
            Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;


        const userId =
            (req as any).user.id;


        const file =
            await prisma.file.findFirst({

                where: {
                    id,
                    userId
                }

            });


        if (!file) {

            return res.status(404).json({
                message: "File not found"
            });

        }


        const command =
            new GetObjectCommand({

                Bucket:
                    env.AWS.BUCKET,

                Key:
                    file.s3Key

            });


        const previewUrl =
            await getSignedUrl(
                s3,
                command,
                {
                    expiresIn: 300
                }
            );


        res.json({
            previewUrl
        });


    } catch (error) {

        console.log(error);


        res.status(500).json({
            message: "Preview failed"
        });

    }

};
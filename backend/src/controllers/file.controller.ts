import { Request, Response } from "express";
import prisma from "../config/prisma";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";

import {
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

import { s3 } from "../config/s3";


// Generate S3 upload URL
export const generateUploadUrl = async (
    req: Request,
    res: Response
) => {
    try {
        const { fileName, fileType, fileSize } = req.body;
        const userId = (req as any).user.id;

        // Get user storage details
        const user = await prisma.user.findUnique({
            where: {
                id: userId,
            },
        });

        if (!user) {
            return res.status(404).json({
                message: "User not found",
            });
        }

        // Check storage limit
        const newStorage = user.storageUsed + BigInt(fileSize);

        if (newStorage > user.storageLimit) {
            return res.status(400).json({
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

        // Generate presigned POST
        const { url, fields } = await createPresignedPost(s3, {
            Bucket: env.AWS.BUCKET!,
            Key: key,
            Expires: 300,
            Fields: {
                "Content-Type": fileType,
            },
            Conditions: [
                ["content-length-range", 1, 50 * 1024 * 1024],
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
    let s3Key: string | undefined;

    try {
        const { name, type, size } = req.body;
        s3Key = req.body.s3Key;

        const expectedPrefix = `users/${userId}/`;

        if (
            typeof s3Key !== "string" ||
            !s3Key.startsWith(expectedPrefix)
        ) {
            return res.status(403).json({
                message: "Invalid file key",
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
            const createdFile = await tx.file.create({
                data: {
                    name,
                    type,
                    size,
                    s3Key: s3Key!,
                    url: `https://${env.AWS.BUCKET}.s3.${env.AWS.REGION}.amazonaws.com/${s3Key}`,
                    userId,
                },
            });

            await tx.user.update({
                where: {
                    id: userId,
                },
                data: {
                    storageUsed: {
                        increment: size,
                    },
                },
            });

            return createdFile;
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
            typeof s3Key === "string" &&
            s3Key.startsWith(`users/${userId}/`)
        ) {
            try {
                await s3.send(
                    new DeleteObjectCommand({
                        Bucket: env.AWS.BUCKET,
                        Key: s3Key,
                    })
                );
            } catch (cleanupError) {
                console.error("S3 Cleanup Error:", cleanupError);
            }
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

        // Find file belonging to the logged-in user
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

        // Delete metadata and update storage atomically
        await prisma.$transaction([
            prisma.file.delete({
                where: {
                    id: file.id,
                },
            }),

            prisma.user.update({
                where: {
                    id: userId,
                },
                data: {
                    storageUsed: {
                        decrement: file.size,
                    },
                },
            }),
        ]);

        // Delete actual object from AWS S3
        await s3.send(
            new DeleteObjectCommand({
                Bucket: env.AWS.BUCKET,
                Key: file.s3Key,
            })
        );

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
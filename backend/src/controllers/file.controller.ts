import { Request, Response } from "express";
import prisma from "../config/prisma";

import {
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand
} from "@aws-sdk/client-s3";

import {
    getSignedUrl
} from "@aws-sdk/s3-request-presigner";

import { s3 } from "../config/s3";


// Generate S3 upload URL
export const generateUploadUrl = async (
    req: Request,
    res: Response
) => {

    try {

        const {
            fileName,
            fileType,
            fileSize
        } = req.body;


        const userId =
            (req as any).user.id;


        // Get user storage details
        const user =
            await prisma.user.findUnique({

                where: {
                    id: userId
                }

            });


        if (!user) {

            return res.status(404).json({

                message:
                    "User not found"

            });

        }


        // Check storage limit
        const newStorage =
            user.storageUsed + BigInt(fileSize);


        if (
            newStorage >
            user.storageLimit
        ) {

            return res.status(400).json({

                message:
                    "Storage limit exceeded"

            });

        }



        const key =
            `users/${userId}/${Date.now()}-${fileName}`;


        const command =
            new PutObjectCommand({

                Bucket:
                    process.env.AWS_BUCKET_NAME,

                Key:
                    key,

                ContentType:
                    fileType

            });



        const uploadUrl =
            await getSignedUrl(
                s3,
                command,
                {
                    expiresIn: 3600
                }
            );



        res.json({

            uploadUrl,

            key

        });



    } catch (error) {


        console.log(
            "S3 Error:",
            error
        );


        res.status(500).json({

            message:
                "Failed to generate upload URL"

        });


    }

};

// Save file metadata
export const saveFile = async (
    req: Request,
    res: Response
) => {

    try {


        const userId =
            (req as any).user.id;


        const {
            name,
            type,
            size,
            s3Key
        } = req.body;


        const file =
            await prisma.file.create({

                data: {

                    name,

                    type,

                    size,

                    s3Key,

                    url:
                        `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`,

                    userId

                }

            });


        await prisma.user.update({

            where: {
                id: userId
            },


            data: {

                storageUsed: {

                    increment:
                        size

                }

            }

        });


        res.status(201).json({

            success: true,


            file: {

                ...file,


                size:
                    file.size.toString()

            }

        });


    } catch (error) {


        console.log(
            "Save File Error:",
            error
        );


        res.status(500).json({

            message:
                "Failed to save file"

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
                    process.env.AWS_BUCKET_NAME,

                Key:
                    file.s3Key,

                ResponseContentDisposition:
                    `attachment; filename="${file.name}"`

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

        const userId =
            (req as any).user.id;


        const id =
            req.params.id as string;


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


        // Delete actual object from AWS S3

        await s3.send(

            new DeleteObjectCommand({

                Bucket:
                    process.env.AWS_BUCKET_NAME,

                Key:
                    file.s3Key

            })

        );


        // Delete metadata + update storage atomically

        await prisma.$transaction([


            prisma.file.delete({

                where: {

                    id:
                        file.id

                }

            }),


            prisma.user.update({

                where: {

                    id:
                        userId

                },


                data: {

                    storageUsed: {

                        decrement:
                            file.size

                    }

                }

            })


        ]);



        res.json({

            success:
                true,

            message:
                "File deleted successfully"

        });


    } catch (error) {


        console.log(
            "Delete Error:",
            error
        );


        res.status(500).json({

            message:
                "Failed to delete file"

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
                    process.env.AWS_BUCKET_NAME,

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
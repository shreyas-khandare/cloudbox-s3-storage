import { z } from "zod";


export const uploadUrlSchema = z.object({

    fileName:
        z.string()
        .min(1),


    fileType:
        z.string()
        .min(1),


    fileSize:
        z.number()
        .positive()

});


export const saveFileSchema = z.object({

    name:
        z.string()
        .min(1),


    type:
        z.string()
        .min(1),


    size:
        z.number()
        .positive(),


    s3Key:
        z.string()
        .min(1)

});
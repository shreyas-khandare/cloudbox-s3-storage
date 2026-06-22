import dotenv from "dotenv";

dotenv.config();


const requiredEnv = [
    "DATABASE_URL",
    "JWT_SECRET",

    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_BUCKET_NAME",

    "CLIENT_URL"
];


requiredEnv.forEach((key) => {

    if (!process.env[key]) {

        throw new Error(
            `Missing environment variable: ${key}`
        );

    }

});


export const env = {

    DATABASE_URL:
        process.env.DATABASE_URL!,

    JWT_SECRET:
        process.env.JWT_SECRET!,

    CLIENT_URL:
        process.env.CLIENT_URL!,


    AWS: {

        REGION:
            process.env.AWS_REGION!,

        ACCESS_KEY:
            process.env.AWS_ACCESS_KEY_ID!,

        SECRET_KEY:
            process.env.AWS_SECRET_ACCESS_KEY!,

        BUCKET:
            process.env.AWS_BUCKET_NAME!

    }

};
import { createHash, randomBytes } from "node:crypto";
import prisma from "../config/prisma";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// hasshing the raw seesion token before storing or lookup
const hashSessionToken = (token: string): string => {
    return createHash("sha256").update(token).digest("hex");
};

// create a new session the raw token is returned to the caller so it can be sent to the browser in http-only cookie
export const createSession = async (userId: string) =>{
    const token = randomBytes(32).toString("hex");
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    await prisma.session.create({
        data:{
            tokenHash,
            userId,
            expiresAt,
        },
    });

    return {
        token,
        expiresAt,
        maxAge: SESSION_DURATION_MS,
    };
};


//finding a valid session from the raw cookie token expired sessions are rejected and removed.
export const findValidSession = async(token: string) => {
    const tokenHash  = hashSessionToken(token);

    const session = await prisma.session.findUnique({
        where: { tokenHash },
        include: {user: true},
    });

    if (!session) {
        return null;
    }

    if(session.expiresAt.getTime() <= Date.now()){
        await prisma.session.delete({
            where: { id : session.id },
        });
        return null;
    }
    return session;
};

// revoke a session using its raw cookie token
export const revokeSession = async (token: string) => {
    const tokenHash = hashSessionToken(token);

    await prisma.session.deleteMany({
        where: { tokenHash },
    });
};





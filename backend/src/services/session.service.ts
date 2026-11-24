import { createHash, randomBytes } from "node:crypto";
import prisma from "../config/prisma";
import { SUBSCRIPTION_PLANS } from "../config/subscription-plans";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const DEVICE_ID_PATTERN = /^[a-f0-9]{64}$/i;

// Only a hash of the authentication token is stored in the database.
const hashSessionToken = (token: string): string => {
    return createHash("sha256").update(token).digest("hex");
};

// A browser profile keeps one stable device ID. Repeated logins from that
// profile rotate the authentication token on its existing session row.
export const createSession = async (userId: string, deviceId: string) => {
    if (!DEVICE_ID_PATTERN.test(deviceId)) {
        throw new Error("INVALID_DEVICE_ID");
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashSessionToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

    await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
            where: { id: userId },
            select: { plan: true },
        });

        if (!user) {
            throw new Error("USER_NOT_FOUND");
        }

        const planConfig = SUBSCRIPTION_PLANS[user.plan];

        // Serialize concurrent session creation/rotation for this user.
        await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(hashtext(${userId}))
        `;

        // Expired sessions must not occupy a device slot.
        await tx.session.deleteMany({
            where: {
                userId,
                expiresAt: { lte: now },
            },
        });

        // A repeated login from this browser profile rotates the token rather
        // than creating an orphaned row and consuming another device slot.
        const existingDeviceSession = await tx.session.findUnique({
            where: {
                userId_deviceId: { userId, deviceId },
            },
            select: { id: true },
        });

        if (existingDeviceSession) {
            await tx.session.update({
                where: { id: existingDeviceSession.id },
                data: { tokenHash, expiresAt },
            });
            return;
        }

        const activeSessions = await tx.session.count({
            where: { userId },
        });

        if (activeSessions >= planConfig.deviceLimit) {
            throw new Error("DEVICE_LIMIT_REACHED");
        }

        await tx.session.create({
            data: {
                tokenHash,
                userId,
                deviceId,
                expiresAt,
            },
        });
    });

    return {
        token,
        expiresAt,
        maxAge: SESSION_DURATION_MS,
    };
};

// Find a valid session from the raw authentication cookie token.
export const findValidSession = async (token: string) => {
    const tokenHash = hashSessionToken(token);

    const session = await prisma.session.findUnique({
        where: { tokenHash },
        include: { user: true },
    });

    if (!session) {
        return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
        await prisma.session.delete({
            where: { id: session.id },
        });
        return null;
    }

    return session;
};

// Revoke a session using its raw authentication cookie token.
export const revokeSession = async (token: string) => {
    const tokenHash = hashSessionToken(token);

    await prisma.session.deleteMany({
        where: { tokenHash },
    });
};

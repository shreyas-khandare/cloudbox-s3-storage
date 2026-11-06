import prisma from "../config/prisma";

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; //15 MIN
const BATCH_SIZE = 500;

let cleanupRunning = false;

// deleting expired session in batches to avoid overloading the database with a single large delete operation. This function is called periodically by a setInterval in the main server file.
export const cleanupExpiredSessions = async (): Promise<void> => {
    if (cleanupRunning) {
        return;
    }

    cleanupRunning = true;

    try {
        let deletedCount = 0;

        while (true) {
            const expiredSessions = await prisma.session.findMany({
                where: {
                    expiresAt: {
                        lte: new Date(),
                    },
                },
                select: {
                    id: true,
                },
                take: BATCH_SIZE,
            });

            if (expiredSessions.length === 0) {
                break;
            }

            const result = await prisma.session.deleteMany({
                where: {
                    id: {
                        in: expiredSessions.map((session) => session.id),
                    },
                },
            });

            deletedCount += result.count;

            if (expiredSessions.length < BATCH_SIZE) {
                break;
            }
        }

        if (deletedCount > 0) {
            console.info(
                `[Session Cleanup] Deleted ${deletedCount} expired session(s).`
            );
        }
    } catch (error) {
        console.error("[Session Cleanup] Failed to delete expired session:", error);
    } finally {
        cleanupRunning = false;
    }
};

//run cleanup at startup and every 15 min 
export const startSessionCleanup = (): void => {
    void cleanupExpiredSessions();

    const timer = setInterval(() => {
        void cleanupExpiredSessions();
    }, CLEANUP_INTERVAL_MS);

    //allow Nodejs to exit normally if nothing else is keeping it alive.
    timer.unref();

    console.info("[Session Cleanup] Scheduled to run every 15 minutes.");
}
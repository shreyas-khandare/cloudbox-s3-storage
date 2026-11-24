import { Request, Response, NextFunction } from "express";
import { findValidSession } from "../services/session.service";
import { isServiceUnavailable } from "../utils/dependency-error";
import { isValidDeviceId, setDeviceIdCookie } from "../utils/session-device";

export const protect = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try{
        const token = req.cookies?.token;

        if(!token || typeof token !== "string"){
            res.status(401).json({message: "Not Authorized"});
            return;
        }

        const session = await findValidSession(token);

        if(!session){
            res.status(401).json({message: "Invalid or expired Session"});
            return;
        }

        // Existing sessions predate the device_id cookie. Hydrate that cookie
        // from the authenticated database session so existing users keep the
        // same device identity when they next sign in.
        const requestDeviceId = req.cookies?.device_id;
        if (
            !isValidDeviceId(requestDeviceId) ||
            requestDeviceId.toLowerCase() !== session.deviceId
        ) {
            setDeviceIdCookie(res, session.deviceId);
        }

        //preserve the user info expected by existing controller
        (req as any).user = {
            id: session.user.id,
            role: session.user.role,
        };

        next();
    }catch (error){
        console.error("[Auth Middleware] Session Validation Failed:", error);

        res.status(isServiceUnavailable(error) ? 503 : 500).json({
            message: isServiceUnavailable(error)
                ? "Authentication service is temporarily unavailable. Please retry."
                : "Unable to validate the current session.",
        });
    }
};
import { Request, Response, NextFunction } from "express";
import { findValidSession } from "../services/session.service";

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

        //preserve the user info expected by existing controller
        (req as any).user = {
            id: session.user.id,
            role: session.user.role,
        };

        next();
    }catch (error){
        console.error("[Auth Middleware] Session Validation Failed:", error);

        res.status(500).json({
            message: "Authentication service temporarily unavailable",
        });
    }
};
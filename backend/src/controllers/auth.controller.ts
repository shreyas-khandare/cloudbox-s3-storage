import { Request, Response } from "express";
import bcrypt from "bcrypt";

import prisma from "../config/prisma";
import { generateToken } from "../utils/generateToken";

import { OAuth2Client } from "google-auth-library";


const googleClient = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID
);


export const register = async (
    req: Request,
    res: Response
) => {

    try {

        const {
            name,
            email,
            password
        } = req.body;


        const existingUser =
            await prisma.user.findUnique({
                where: {
                    email
                }
            });


        if (existingUser) {
            return res.status(400).json({
                message: "User already exists"
            });
        }


        const hashedPassword =
            await bcrypt.hash(
                password,
                10
            );


        const user =
            await prisma.user.create({
                data: {
                    name,
                    email,
                    password: hashedPassword
                }
            });


        const token =
            generateToken(
                user.id,
                user.role
            );


        // store JWT inside HTTP-only cookie
        res.cookie(
            "token",
            token,
            {
                httpOnly: true,
                secure: false,
                sameSite: "lax",
                maxAge: 7 * 24 * 60 * 60 * 1000
            }
        );


        // remove password
        const {
            password: _,
            ...safeUser
        } = user;


        res.status(201).json({

            user: {
                ...safeUser,

                storageUsed:
                    user.storageUsed.toString(),

                storageLimit:
                    user.storageLimit.toString()
            }

        });


    } catch (error) {

        res.status(500).json({
            message: "Registration failed"
        });

    }

};

export const login = async (
    req: Request,
    res: Response
) => {

    try {

        const { email, password } = req.body;


        const user = await prisma.user.findUnique({
            where: {
                email
            }
        });


        if (!user || !user.password) {
            return res.status(401).json({
                message: "Invalid credentials"
            });
        }


        const isMatch =
            await bcrypt.compare(
                password,
                user.password
            );


        if (!isMatch) {
            return res.status(401).json({
                message: "Invalid credentials"
            });
        }


        const token =
            generateToken(
                user.id,
                user.role
            );


        res.cookie(
            "token",
            token,
            {
                httpOnly: true,
                secure: false,
                sameSite: "lax",
                maxAge: 7 * 24 * 60 * 60 * 1000
            }
        );


        const {
            password: _,
            ...safeUser
        } = user;


        res.json({

            user: {
                ...safeUser,

                storageUsed:
                    user.storageUsed.toString(),

                storageLimit:
                    user.storageLimit.toString()
            }

        });


    } catch (error) {

        res.status(500).json({
            message: "Login failed"
        });

    }

};

export const getMe = async (
    req: Request,
    res: Response
) => {

    try {

        const userId = (req as any).user.id;


        const user = await prisma.user.findUnique({
            where: {
                id: userId
            }
        });


        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }


        const {
            password: _,
            ...safeUser
        } = user;


        res.json({

            user: {
                ...safeUser,

                storageUsed:
                    user.storageUsed.toString(),

                storageLimit:
                    user.storageLimit.toString()
            }

        });


    } catch (error) {

        res.status(500).json({
            message: "Failed to fetch user"
        });

    }

};



export const logout = (
    req: Request,
    res: Response
) => {


    res.clearCookie("token", {
        httpOnly: true,
        secure: false,
        sameSite: "lax"
    });


    res.json({
        message: "Logged out successfully"
    });

};

export const googleLogin = async (
    req: Request,
    res: Response
) => {

    try {

        const { token } = req.body;


        const ticket =
            await googleClient.verifyIdToken({
                idToken: token,
                audience:
                    process.env.GOOGLE_CLIENT_ID
            });


        const payload = ticket.getPayload();


        if (!payload?.email) {
            return res.status(400).json({
                message: "Google auth failed"
            });
        }


        let user =
            await prisma.user.findUnique({
                where: {
                    email: payload.email
                }
            });


        if (!user) {

            user =
                await prisma.user.create({

                    data: {

                        name:
                            payload.name || "",

                        email:
                            payload.email,

                        avatar:
                            payload.picture,

                        provider:
                            "GOOGLE"

                    }

                });

        }


        const jwtToken =
            generateToken(
                user.id,
                user.role
            );


        res.cookie(
            "token",
            jwtToken,
            {
                httpOnly: true,
                secure: false,
                sameSite: "lax",
                maxAge: 7 * 24 * 60 * 60 * 1000
            }
        );


        const {
            password: _,
            ...safeUser
        } = user;


        res.json({

            user: {
                ...safeUser,

                storageUsed:
                    user.storageUsed.toString(),

                storageLimit:
                    user.storageLimit.toString()

            }

        });


    } catch (error) {

        res.status(500).json({
            message: "Google login failed"
        });

    }

};
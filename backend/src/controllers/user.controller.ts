import { Request, Response } from "express";
import prisma from "../config/prisma";


export const getUsers = async (
    req: Request,
    res: Response
) => {

    const users = await prisma.user.findMany();


    const formattedUsers = users.map(user => {

        const {
            password: _,
            ...safeUser
        } = user;


        return {

            ...safeUser,

            storageUsed:
                user.storageUsed.toString(),

            storageLimit:
                user.storageLimit.toString()

        };

    });


    res.json({
        success: true,
        data: formattedUsers
    });

};
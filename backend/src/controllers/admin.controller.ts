import { Request, Response } from "express";

import prisma from "../config/prisma";


// Admin Stats
export const getStats = async (
    req: Request,
    res: Response
) => {

    try {

        const totalUsers =
            await prisma.user.count();


        const totalFiles =
            await prisma.file.count();


        const storage =
            await prisma.file.aggregate({

                _sum: {

                    size: true

                }

            });


        res.json({

            totalUsers,

            totalFiles,

            storageUsed:
                storage._sum.size?.toString() || "0"

        });


    } catch (error) {


        res.status(500).json({

            message:
                "Failed to fetch stats"

        });

    }

};



// Get all users
export const getAdminUsers = async (
    req: Request,
    res: Response
) => {

    try {

        const users =
            await prisma.user.findMany({

                select: {

                    id: true,

                    name: true,

                    email: true,

                    role: true,

                    storageUsed: true,

                    createdAt: true,


                    _count: {

                        select: {

                            files: true

                        }

                    }

                }

            });


        res.json({

            users: users.map(
                user => ({

                    ...user,

                    storageUsed:
                        user.storageUsed.toString()

                })
            )

        });


    } catch (error) {

        res.status(500).json({

            message:
                "Failed to fetch users"

        });

    }

};



// Get all files
export const getAdminFiles = async (
    req: Request,
    res: Response
) => {

    try {


        const files =
            await prisma.file.findMany({

                include: {

                    user: {

                        select: {

                            name: true,

                            email: true

                        }

                    }

                }

            });


        res.json({

            files: files.map(
                file => ({

                    ...file,

                    size:
                        file.size.toString()

                })
            )

        });


    } catch (error) {


        res.status(500).json({

            message:
                "Failed to fetch files"

        });

    }

};
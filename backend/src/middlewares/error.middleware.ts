import {
    Request,
    Response,
    NextFunction
} from "express";


export const errorHandler = (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {


    console.log(
        "ERROR:",
        error.message
    );


    res.status(500).json({

        success: false,

        message:
            error.message ||
            "Internal server error"

    });


};
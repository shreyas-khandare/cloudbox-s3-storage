import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import fileRoutes from "./routes/file.routes";
import { errorHandler } from "./middlewares/error.middleware";

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://cloudbox-s3-storage.vercel.app",
  "https://mycloudbox.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());

app.use(
  helmet({
    crossOriginOpenerPolicy: {
      policy: "same-origin-allow-popups",
    },
  })
);

app.use(morgan("dev"));
app.use(cookieParser());

app.get("/", (_req, res) => {
  res.json({ message: "Cloud Storage API Running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/files", fileRoutes);

app.use(errorHandler);

export default app;

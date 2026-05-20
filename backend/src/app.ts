import express, { Request, Response } from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import categoryRoutes from "./routes/categoryRoutes";
import noteRoutes from "./routes/noteRoutes";
import reportRoutes from "./routes/reportRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import { logOcrRuntimeSummary } from "./controllers/NoteController";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const OCR_REQUEST_TIMEOUT_MS = Number(
  process.env.OCR_REQUEST_TIMEOUT_MS || 600000,
);

// Middlewares
app.use(cors());
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve static files for old uploaded images (backward compatibility)
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/notifications", notificationRoutes);

// Health check endpoint
app.get("/api/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "success", message: "API is running" });
});

// Fallback for 404
app.use((req: Request, res: Response) => {
  res
    .status(404)
    .json({ status: "error", code: 404, message: "Endpoint not found" });
});

// Global Error Handler to catch Multer/Express errors
app.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
  console.error(">>> [GLOBAL ERROR HANDLER]", err);
  res.status(err.status || 500).json({
    status: "error",
    message: err.message || "Internal server error",
  });
});

const server = app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
  logOcrRuntimeSummary();
});

server.timeout = OCR_REQUEST_TIMEOUT_MS;
server.requestTimeout = OCR_REQUEST_TIMEOUT_MS;
server.headersTimeout = OCR_REQUEST_TIMEOUT_MS + 1000;

let isShuttingDown = false;

server.on("close", () => {
  if (!isShuttingDown) {
    console.warn(">>> [BACKEND] HTTP server closed unexpectedly");
  }
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `>>> [BACKEND] Port ${PORT} is already in use. Stop the other backend process or run this app with a different PORT.`,
    );
    process.exit(1);
  }

  console.error(">>> [BACKEND] HTTP server error:", error);
});

const keepAliveTimer = setInterval(() => {
  // Keep the ts-node/nodemon dev process alive on Windows.
}, 60_000);

const shutdown = () => {
  isShuttingDown = true;
  clearInterval(keepAliveTimer);
  server.close(() => process.exit(0));
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

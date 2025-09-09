import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { createServer } from "http";
import path from "path";

import { errorHandler, notFound } from "@/middleware/errorMiddleware";
import { logger } from "@/utils/logger";
import { initializeQdrant } from "@/services/vectorService";

// Import routes
import documentRoutes from "@/routes/documentRoutes";
import chatRoutes from "@/routes/chatRoutes";
import userRoutes from "@/routes/userRoutes";

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  "MONGODB_URI",
  "OPENAI_API_KEY",
  "QDRANT_HOST",
  "QDRANT_PORT",
];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  logger.error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`
  );
  process.exit(1);
}

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["https://yourdomain.com"]
        : ["http://localhost:8080", "http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/users", userRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/chat", chatRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Database connections and server startup
async function startServer() {
  try {
    // Connect to MongoDB
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      logger.info('Connected to MongoDB');
    }

    // Initialize Qdrant (optional - server can run without it)
    try {
      await initializeQdrant();
      logger.info("Connected to Qdrant");
    } catch (error) {
      logger.warn(
        "Qdrant connection failed - continuing without vector search capabilities"
      );
    }

    // Start server
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    mongoose.connection.close();
    process.exit(0);
  });
});

startServer();
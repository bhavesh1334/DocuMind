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
];

// Optional but recommended environment variables
const optionalEnvVars = [
  "QDRANT_HOST",
  "QDRANT_PORT",
  "QDRANT_URL",
  "QDRANT_API_KEY"
];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
const missingOptionalVars = optionalEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  logger.error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`
  );
  process.exit(1);
}

if (missingOptionalVars.length > 0) {
  logger.warn(
    `Missing optional environment variables: ${missingOptionalVars.join(", ")} - some features may be limited`
  );
}

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https://api.openai.com", "https://*.onrender.com", "https://*.netlify.app/"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));
app.use(
  cors({
    origin: process.env.NODE_ENV === 'production' 
      ? [process.env.FRONTEND_URL, /\.onrender\.com$/].filter((origin): origin is string | RegExp => origin !== undefined)
      : '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request timeout middleware
app.use((req, res, next) => {
  req.setTimeout(60000); // 60 seconds
  res.setTimeout(60000);
  next();
});

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    services: {
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
      qdrant: process.env.QDRANT_HOST ? 'configured' : 'missing'
    }
  });
});

// API status endpoint
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    message: "API is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0"
  });
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
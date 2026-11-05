import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { ZodError } from "zod";
import { readConfig } from "./utils/config.js";
import { connectDb, stores } from "./models/db.js";
import { authRoutes, currentUser, cookieOptions, hash } from "./routes/auth.js";
import { officeRoutes } from "./routes/office.js";
import { fileRoutes } from "./routes/files.js";
import { documentRoutes } from "./routes/documents.js";
import { HttpError } from "./utils/errors.js";

export function createApp(db, config) {
  const app = express();
  app.disable("x-powered-by");
  if (config.production) app.set("trust proxy", 1);

  const isAllowedOrigin = (origin, callback) => {
    if (!origin) return callback(null, true);
    if (config.isAllowedOrigin ? config.isAllowedOrigin(origin) : origin === config.origin) {
      return callback(null, true);
    }
    return callback(new HttpError(403, "CORS origin not allowed: " + origin));
  };

  const corsMiddleware = cors({
    origin: isAllowedOrigin,
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cookie",
      "Origin",
      "X-Requested-With",
      "Accept",
    ],
    exposedHeaders: ["Set-Cookie"],
  });

  app.use(corsMiddleware);
  app.options("/{*splat}", corsMiddleware);

  const isHttpsOrigin = config.origin?.startsWith("https:");

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", ...(config.allowedOrigins || [])],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.production && isHttpsOrigin ? [] : null,
        },
      },
      strictTransportSecurity: config.production && isHttpsOrigin ? undefined : false,
    }),
  );

  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/logout", async (req, res) => {
    const id = req.cookies?.dixaz_session;
    if (typeof id === "string") {
      try {
        await stores(db).sessions.deleteOne({ _id: hash(id) });
      } catch {}
    }
    res.clearCookie("dixaz_session", cookieOptions(config));
    return res.redirect(303, "/");
  });

  app.use(["/api", "/auth"], (_req, res, next) => {
    res.set({ "Cache-Control": "private, no-store", Vary: "Cookie" });
    next();
  });

  app.use(
    "/auth",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 50,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    authRoutes(db, config),
  );

  app.get("/api/health", async (_req, res) => {
    await db.command({ ping: 1 });
    res.json({ ok: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    res.json({ user: await currentUser(db, req) });
  });

  app.use("/api/office", officeRoutes(db, config));
  app.use("/api/files", fileRoutes(db, config));
  app.use("/api/documents", documentRoutes(db, config));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  const dist = resolve(import.meta.dirname, "../frontend/dist");
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false }));
    app.get("/{*splat}", (_req, res) => {
      res
        .set("Cache-Control", "no-store")
        .sendFile(resolve(dist, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res
        .type("text")
        .send(
          "DIXAZ API is running. Use http://localhost:5173 for development, or run npm run build.",
        );
    });
  }

  app.use((err, _req, res, _next) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const e = err;
    const status =
      err instanceof HttpError
        ? err.status
        : err instanceof multer.MulterError || e?.type === "entity.too.large"
          ? 413
          : err instanceof ZodError || e?.type === "entity.parse.failed"
            ? 400
            : 500;
    if (status === 500)
      console.error("Request failed:", err);
    res.status(status).json({
      error:
        err instanceof HttpError
          ? err.message
          : status === 413
            ? "Request or upload too large"
            : status === 400
              ? "Invalid request data"
              : "Server error. Please retry.",
    });
  });

  return app;
}

// Auto-start when executed directly
const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase();

if (isDirectRun) {
  try {
    const config = readConfig();
    const { client, db } = await connectDb(config.mongoUri, config.dbName);
    const server = createApp(db, config).listen(config.port, "0.0.0.0", () =>
      console.log(`DIXAZ API listening on port ${config.port}`),
    );

    let closing = false;
    async function shutdown() {
      if (closing) return;
      closing = true;
      server.close(async () => {
        await client.close();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    }
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}


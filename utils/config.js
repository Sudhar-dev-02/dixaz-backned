import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(import.meta.dirname, "../.env") });

export function readConfig() {
  const appUrl = new URL(process.env.APP_URL || "http://localhost:5173");
  const production = process.env.NODE_ENV === "production";
  const isLocalhost =
    appUrl.hostname === "localhost" ||
    appUrl.hostname === "127.0.0.1" ||
    appUrl.hostname === "::1";

  if (production && appUrl.protocol !== "https:" && !isLocalhost) {
    throw Error("APP_URL must use HTTPS in production (e.g. https://your-domain.com)");
  }

  if (!process.env.MONGODB_URI) throw Error("MONGODB_URI is required");

  const adminEmail = (
    process.env.ADMIN_EMAIL ||
    process.env.DIXAZ_OWNER_EMAIL ||
    "admin@dixaz.com"
  )
    .trim()
    .toLowerCase();

  const adminPassword = (process.env.ADMIN_PASSWORD || "admin123").trim();

  const rawCors =
    process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS || "";
  const extraOrigins = rawCors
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const originsSet = new Set([appUrl.origin, ...extraOrigins]);
  if (!production) {
    originsSet.add("http://localhost:5173");
    originsSet.add("http://localhost:3000");
    originsSet.add("http://127.0.0.1:5173");
    originsSet.add("http://127.0.0.1:3000");
  }

  const allowedOrigins = Array.from(originsSet);

  const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    if (extraOrigins.includes("*")) return true;
    return allowedOrigins.includes(origin);
  };

  return {
    origin: appUrl.origin,
    allowedOrigins,
    isAllowedOrigin,
    production,
    mongoUri: process.env.MONGODB_URI,
    dbName: process.env.MONGODB_DB || "dixaz_office",
    ownerEmail: adminEmail,
    adminEmail,
    adminPassword,
    googleId: process.env.GOOGLE_CLIENT_ID || "",
    googleSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    port: Number(process.env.PORT || 3000),
  };
}

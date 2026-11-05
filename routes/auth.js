import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import { stores } from "../models/db.js";
import { verifyGoogleToken } from "../utils/google-token.js";
import { HttpError } from "../utils/errors.js";

export const token = () => randomBytes(32).toString("base64url");
export const hash = (s) =>
  createHash("sha256").update(s).digest("base64url");

export const cookieOptions = (config) => {
  const isHttps =
    Boolean(config.origin?.startsWith("https:")) ||
    process.env.COOKIE_SECURE === "true";
  let sameSite = process.env.COOKIE_SAMESITE || "lax";
  if (sameSite === "none" && !isHttps) {
    sameSite = "lax";
  }
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite,
    path: "/",
  };
};

export function csrf(config) {
  return (req, _res, next) => {
    const origin = req.get("origin");
    if (!origin) return next();
    const isAllowed = config.isAllowedOrigin
      ? config.isAllowedOrigin(origin)
      : origin === config.origin;
    if (isAllowed) return next();
    return next(new HttpError(403, "Invalid request origin"));
  };
}

export async function currentUser(db, req) {
  const id = req.cookies?.dixaz_session;
  if (typeof id !== "string" || id.length > 128) return null;
  const row = await stores(db).sessions.findOne({
    _id: hash(id),
    expiresAt: { $gt: new Date() },
  });
  return row?.user || null;
}

export function authRoutes(db, config) {
  const router = Router();
  const { sessions, oauth } = stores(db);

  if (!config.production) {
    router.get("/dev-login", async (_req, res) => {
      const email = (config.ownerEmail || "your-owner-email@gmail.com")
        .trim()
        .toLowerCase();
      const session = token();
      await sessions.insertOne({
        _id: hash(session),
        user: {
          userId: "dev:super_admin",
          email,
          displayName: "Super Admin",
          fullName: "DIXAZ Super Admin",
        },
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });
      res.cookie("dixaz_session", session, {
        ...cookieOptions(config),
        maxAge: 7 * 86400000,
      });
      res.redirect(config.origin || "/");
    });
  }

  router.get("/google", async (_req, res) => {
    if (!config.googleId || !config.googleSecret)
      throw new HttpError(
        503,
        "Google login needs server configuration. See README.md.",
      );
    const state = token(),
      verifier = token();
    await oauth.insertOne({
      _id: hash(state),
      verifier,
      expiresAt: new Date(Date.now() + 600000),
    });
    res.cookie("dixaz_oauth", state, {
      ...cookieOptions(config),
      maxAge: 600000,
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: config.googleId,
      redirect_uri: config.origin + "/auth/callback/google",
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce: hash(verifier + "nonce"),
      code_challenge: hash(verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    res.redirect(url.toString());
  });

  router.get("/callback/google", async (req, res) => {
    try {
      const { state, code } = req.query;
      if (
        typeof state !== "string" ||
        typeof code !== "string" ||
        req.cookies?.dixaz_oauth !== state
      )
        throw Error("Invalid state");
      const row = await oauth.findOneAndDelete({
        _id: hash(state),
        expiresAt: { $gt: new Date() },
      });
      res.clearCookie("dixaz_oauth", cookieOptions(config));
      if (!row) throw Error("Expired transaction");
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.googleId,
          client_secret: config.googleSecret,
          redirect_uri: config.origin + "/auth/callback/google",
          grant_type: "authorization_code",
          code_verifier: row.verifier,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw Error("Token exchange failed");
      const credentials = await response.json();
      const jwks = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
        signal: AbortSignal.timeout(15000),
      });
      if (!jwks.ok) throw Error("Keys unavailable");
      const keys = await jwks.json();
      const p = verifyGoogleToken(
        credentials.id_token,
        keys.keys,
        config.googleId,
        hash(row.verifier + "nonce"),
      );
      const old = req.cookies?.dixaz_session;
      if (typeof old === "string") await sessions.deleteOne({ _id: hash(old) });
      const session = token();
      await sessions.insertOne({
        _id: hash(session),
        user: {
          userId: "google:" + p.sub,
          email: p.email.toLowerCase(),
          displayName: p.name || p.email,
          fullName: p.name || null,
        },
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });
      res.cookie("dixaz_session", session, {
        ...cookieOptions(config),
        maxAge: 7 * 86400000,
      });
      res.redirect(config.origin);
    } catch {
      res
        .status(400)
        .type("html")
        .send(
          '<h1>Sign-in failed or expired</h1><p>Please try again.</p><a href="/login">Return to login</a>',
        );
    }
  });

  router.post("/login", async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password).trim();

    let user = null;

    if (
      cleanEmail === config.adminEmail.toLowerCase() &&
      cleanPassword === config.adminPassword
    ) {
      user = {
        userId: "local:super_admin",
        email: config.adminEmail.toLowerCase(),
        displayName: "Super Admin",
        fullName: "DIXAZ Super Admin",
      };
    } else {
      const { workspaces } = stores(db);
      const row = await workspaces.findOne({ _id: "main" });
      const state = row ? row.state : null;
      if (state) {
        const member = state.members?.find(
          (m) => m.email?.toLowerCase() === cleanEmail && m.active,
        );
        const client = state.clients?.find(
          (c) => c.email?.toLowerCase() === cleanEmail && c.active,
        );

        if (
          member &&
          cleanPassword === config.adminPassword
        ) {
          user = {
            userId: member.userId || `local:${member.id}`,
            email: member.email.toLowerCase(),
            displayName: member.name,
            fullName: member.name,
          };
        } else if (
          client &&
          cleanPassword === config.adminPassword
        ) {
          user = {
            userId: `local:client:${client.id}`,
            email: client.email.toLowerCase(),
            displayName: client.name,
            fullName: client.name,
          };
        }
      }
    }

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const session = token();
    const old = req.cookies?.dixaz_session;
    if (typeof old === "string") {
      try {
        await sessions.deleteOne({ _id: hash(old) });
      } catch {}
    }

    await sessions.insertOne({
      _id: hash(session),
      user,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    });

    res.cookie("dixaz_session", session, {
      ...cookieOptions(config),
      maxAge: 7 * 86400000,
    });

    return res.json({ ok: true, user });
  });

  router.get("/logout", async (req, res) => {
    const id = req.cookies?.dixaz_session;
    if (typeof id === "string") await sessions.deleteOne({ _id: hash(id) });
    res.clearCookie("dixaz_session", cookieOptions(config));
    res.redirect(303, config.origin + "/login");
  });

  router.post("/logout", csrf(config), async (req, res) => {
    const id = req.cookies?.dixaz_session;
    if (typeof id === "string") await sessions.deleteOne({ _id: hash(id) });
    res.clearCookie("dixaz_session", cookieOptions(config));
    res.redirect(303, config.origin + "/login");
  });

  return router;
}

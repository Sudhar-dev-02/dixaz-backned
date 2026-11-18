import { Router } from "express";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { currentUser, csrf } from "./auth.js";
import { context, commit } from "../services/workspace.js";
import { stores } from "../models/db.js";
import { HttpError } from "../utils/errors.js";
import { canReadAsset, canUploadAsset } from "../utils/access.js";
import { validateUpload } from "../utils/files.js";

export function fileRoutes(db, config) {
  const router = Router();
  const ctx = (req) =>
    currentUser(db, req).then((user) => context(db, user, config.ownerEmail));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 8 * 1024 * 1024,
      files: 1,
      fields: 2,
      fieldSize: 200,
      parts: 3,
    },
  });

  router.post(
    "/",
    csrf(config),
    rateLimit({
      windowMs: 60000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    async (req, res, next) => {
      res.locals.context = await ctx(req);
      next();
    },
    upload.single("file"),
    async (req, res) => {
      const c = res.locals.context;
      const { kind, targetId } = req.body || {};
      if (
        ![
          "clientLogo",
          "profilePhoto",
          "resume",
          "certificate",
          "appointment",
          "paymentQR",
        ].includes(kind) ||
        typeof targetId !== "string" ||
        !canUploadAsset(c.state, c.actor, kind, targetId)
      )
        throw new HttpError(403, "Upload not permitted");
      if (!req.file) throw new HttpError(400, "Choose a file");
      let mime;
      try {
        mime = validateUpload(kind, req.file.originalname, req.file.buffer);
      } catch (e) {
        throw new HttpError(400, e.message);
      }
      const id = randomUUID();
      const version =
        1 +
        Math.max(
          0,
          ...c.state.assets
            .filter((f) => f.kind === kind && f.targetId === targetId)
            .map((f) => f.version),
        );
      const asset = {
        id,
        kind,
        targetId,
        name: req.file.originalname
          .replace(/[\r\n\x00-\x1f]/g, "")
          .slice(0, 180),
        mime,
        size: req.file.size,
        version,
        current: true,
        uploadedAt: new Date().toISOString(),
        uploadedBy: c.actor.name,
      };
      const { files } = stores(db);
      const stream = files.openUploadStream(id, {
        metadata: { assetId: id, owner: c.owner, mime },
      });
      try {
        await pipeline(Readable.from(req.file.buffer), stream);
      } catch (e) {
        await files.delete(stream.id).catch(() => {});
        throw e;
      }
      const state = structuredClone(c.state);
      state.assets.forEach((f) => {
        if (f.kind === kind && f.targetId === targetId) f.current = false;
      });
      state.assets.push(asset);
      if (kind === "paymentQR") state.settings.paymentQrId = id;
      try {
        await commit(db, c.owner, c.revision, state);
      } catch (e) {
        await files.delete(stream.id).catch(() => {});
        throw e;
      }
      res.status(201).json({ ok: true, asset });
    },
  );

  router.get("/:id", async (req, res) => {
    let c = null;
    try {
      c = await ctx(req);
    } catch {}

    const { workspaces, files } = stores(db);
    const row = await workspaces.findOne({ _id: "main" });
    const allAssets = c?.state?.assets || row?.state?.assets || [];
    const asset = allAssets.find((f) => f.id === req.params.id);
    if (!asset) throw new HttpError(404, "File unavailable");

    // Allow paymentQR or authenticated users who can read asset
    const isPaymentQR = asset.kind === "paymentQR";
    const canRead = isPaymentQR || (c && canReadAsset(c.state, c.actor, asset));
    if (!canRead) throw new HttpError(404, "File unavailable");

    const owner = c?.owner || row?.owner;
    const stored = await files
      .find({ "metadata.assetId": asset.id, "metadata.owner": owner })
      .next();
    if (!stored) throw new HttpError(404, "File unavailable");

    res.set({
      "Content-Type": asset.mime,
      "Content-Length": String(asset.size),
      "Content-Disposition": `${asset.mime.startsWith("image/") ? "inline" : "attachment"}; filename="${asset.kind}.${asset.mime === "application/pdf" ? "pdf" : asset.mime.split("/")[1]}"; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    await pipeline(files.openDownloadStream(stored._id), res);
  });

  router.delete("/:id", csrf(config), async (req, res) => {
    const c = await ctx(req);
    const asset = c.state.assets.find((f) => f.id === req.params.id);
    if (!asset) throw new HttpError(404, "File unavailable");
    if (!canUploadAsset(c.state, c.actor, asset.kind, asset.targetId))
      throw new HttpError(403, "Permission denied to delete file");

    const state = structuredClone(c.state);
    state.assets = state.assets.filter((f) => f.id !== asset.id);

    if (asset.kind === "paymentQR") {
      const remainingQRs = state.assets
        .filter((f) => f.kind === "paymentQR" && f.targetId === asset.targetId)
        .sort((a, b) => b.version - a.version);
      if (state.settings.paymentQrId === asset.id || asset.current) {
        if (remainingQRs.length > 0) {
          remainingQRs.forEach((r, idx) => {
            r.current = idx === 0;
          });
          state.settings.paymentQrId = remainingQRs[0].id;
        } else {
          state.settings.paymentQrId = "";
        }
      }
    } else {
      const remaining = state.assets
        .filter((f) => f.kind === asset.kind && f.targetId === asset.targetId)
        .sort((a, b) => b.version - a.version);
      if (remaining.length > 0 && !remaining.some((f) => f.current)) {
        remaining[0].current = true;
      }
    }

    const { files } = stores(db);
    try {
      const stored = await files
        .find({ "metadata.assetId": asset.id, "metadata.owner": c.owner })
        .next();
      if (stored) {
        await files.delete(stored._id).catch(() => {});
      }
    } catch {}

    await commit(db, c.owner, c.revision, state);
    res.json({ ok: true, deletedId: asset.id });
  });

  router.post("/:id/make-current", csrf(config), async (req, res) => {
    const c = await ctx(req);
    const asset = c.state.assets.find((f) => f.id === req.params.id);
    if (!asset) throw new HttpError(404, "File unavailable");
    if (!canUploadAsset(c.state, c.actor, asset.kind, asset.targetId))
      throw new HttpError(403, "Permission denied");

    const state = structuredClone(c.state);
    state.assets.forEach((f) => {
      if (f.kind === asset.kind && f.targetId === asset.targetId) {
        f.current = f.id === asset.id;
      }
    });
    if (asset.kind === "paymentQR") {
      state.settings.paymentQrId = asset.id;
    }
    await commit(db, c.owner, c.revision, state);
    res.json({ ok: true, assetId: asset.id });
  });

  return router;
}


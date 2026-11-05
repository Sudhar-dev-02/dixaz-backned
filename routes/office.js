import { Router, json } from "express";
import { currentUser, csrf } from "./auth.js";
import { context, commit } from "../services/workspace.js";
import { HttpError } from "../utils/errors.js";
import { applyAuthorized, filtered } from "../utils/access.js";

export function officeRoutes(db, config) {
  const router = Router();
  const ctx = (req) =>
    currentUser(db, req).then((user) => context(db, user, config.ownerEmail));

  router.get("/", async (req, res) => {
    const c = await ctx(req);
    res.json({
      state: filtered(c.state, c.actor),
      actor: c.actor,
      revision: c.revision,
    });
  });

  router.post(
    "/",
    csrf(config),
    json({ limit: "128kb" }),
    async (req, res) => {
      const c = await ctx(req);
      const body = req.body;
      if (body?.action === "dailyUpdate" || body?.action === "taskReview")
        throw new HttpError(
          400,
          "Use the timed work log and submission review forms",
        );
      if (
        !body ||
        typeof body.action !== "string" ||
        !Number.isInteger(body.revision)
      )
        throw new HttpError(400, "Invalid action request");
      if (body.revision !== c.revision)
        throw new HttpError(
          409,
          "Another tab changed the workspace. Refresh and retry.",
        );
      const member =
        body.action === "member"
          ? body.payload
          : body.action === "requestChange" && body.payload?.action === "member"
            ? body.payload.payload
            : null;
      if (
        member &&
        [c.user.email, config.ownerEmail].includes(
          String(member.email).toLowerCase(),
        )
      )
        throw new HttpError(
          400,
          "Cannot replace the owner or your own account",
        );
      let state;
      try {
        state = applyAuthorized(c.state, c.actor, body.action, body.payload);
      } catch (e) {
        throw new HttpError(
          400,
          e instanceof Error ? e.message : "Invalid action",
        );
      }
      await commit(db, c.owner, c.revision, state);
      res.json({
        state: filtered(state, c.actor),
        actor: c.actor,
        revision: c.revision + 1,
      });
    },
  );

  return router;
}


import { Router } from "express";
import { currentUser } from "./auth.js";
import { context } from "../services/workspace.js";
import { HttpError } from "../utils/errors.js";
import { filtered } from "../utils/access.js";

export function documentRoutes(db, config) {
  const router = Router();
  const ctx = (req) =>
    currentUser(db, req).then((user) => context(db, user, config.ownerEmail));

  router.get("/:id", async (req, res) => {
    const c = await ctx(req);
    const document = filtered(c.state, c.actor).documents.find(
      (d) => d.id === req.params.id,
    );
    if (!document) throw new HttpError(404, "Document unavailable");
    res.json({ document });
  });

  return router;
}


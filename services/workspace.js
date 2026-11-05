import { stores, assertWorkspaceSize } from "../models/db.js";
import { blank, seed } from "./office.js";
import { actorFor, normalize } from "../utils/access.js";
import { HttpError } from "../utils/errors.js";

export async function context(db, user, ownerEmail) {
  if (!user) throw new HttpError(401, "Sign in required");
  const { workspaces } = stores(db);
  let row = await workspaces.findOne({ _id: "main" });
  const isSuperAdminUser =
    user.userId === "local:super_admin" ||
    user.userId === "dev:super_admin" ||
    (ownerEmail && user.email?.toLowerCase() === ownerEmail.toLowerCase());

  if (!row) {
    if (!isSuperAdminUser && user.email !== ownerEmail)
      throw new HttpError(
        403,
        "Ask the owner to sign in and initialize DIXAZ first.",
      );
    try {
      await workspaces.insertOne({
        _id: "main",
        owner: user.userId,
        revision: 0,
        state: blank(),
      });
    } catch (e) {
      if (e?.code !== 11000) throw e;
    }
    row = await workspaces.findOne({ _id: "main" });
  }
  if (!row) throw new HttpError(503, "Workspace unavailable");
  const state = normalize(row.state);
  const actor =
    isSuperAdminUser || user.userId === row.owner
      ? {
          role: "super_admin",
          memberId: "owner",
          name: user.displayName || "Super Admin",
          email: user.email,
          clientId: "",
        }
      : actorFor(state, user, row.owner);
  if (!actor)
    throw new HttpError(
      403,
      "Access not assigned or inactive. Ask DIXAZ to add your Google email.",
    );
  let revision = row.revision;
  if (actor.role !== "super_admin") {
    const member = state.members.find((m) => m.id === actor.memberId);
    if (member && !member.userId) {
      member.userId = user.userId;
      await commit(db, row.owner, revision, state);
      revision++;
    }
  }
  return { state, actor, revision, owner: row.owner, user };
}

export async function commit(db, owner, revision, state) {
  assertWorkspaceSize(state);
  const result = await stores(db).workspaces.updateOne(
    { _id: "main", owner, revision },
    { $set: { state }, $inc: { revision: 1 } },
  );
  if (result.modifiedCount !== 1)
    throw new HttpError(
      409,
      "Another request changed the workspace. Refresh and retry.",
    );
}


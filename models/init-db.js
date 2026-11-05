import { readConfig } from "../utils/config.js";
import { connectDb, stores } from "./db.js";
import { blank } from "../services/office.js";

const config = readConfig();
const { client, db } = await connectDb(config.mongoUri, config.dbName);
const { workspaces, sessions } = stores(db);

const cleanState = blank();
cleanState.settings.email = config.adminEmail;

const existing = await workspaces.findOne({ _id: "main" });

await workspaces.updateOne(
  { _id: "main" },
  {
    $set: {
      owner: "local:super_admin",
      revision: existing ? (existing.revision || 0) + 1 : 1,
      state: cleanState,
    },
  },
  { upsert: true },
);

// Clear old sessions to prevent stale sessions
await sessions.deleteMany({});

console.log(
  "Cleaned all test data. DIXAZ production workspace is ready with zero dummy records.",
);
console.log("DIXAZ MongoDB collections, validation and indexes are ready.");
await client.close();

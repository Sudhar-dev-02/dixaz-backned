import { MongoClient, GridFSBucket, BSON } from "mongodb";

export function stores(db) {
  return {
    workspaces: db.collection("workspaces"),
    sessions: db.collection("sessions"),
    oauth: db.collection("oauth"),
    files: new GridFSBucket(db, { bucketName: "private_files" }),
  };
}

export async function initDb(db) {
  const definitions = [
    [
      "workspaces",
      {
        bsonType: "object",
        required: ["_id", "owner", "revision", "state"],
        properties: {
          _id: { bsonType: "string" },
          owner: { bsonType: "string" },
          revision: { bsonType: ["int", "long", "double"] },
          state: { bsonType: "object" },
        },
      },
    ],
    [
      "sessions",
      {
        bsonType: "object",
        required: ["_id", "user", "expiresAt"],
        properties: {
          _id: { bsonType: "string" },
          user: { bsonType: "object" },
          expiresAt: { bsonType: "date" },
        },
      },
    ],
    [
      "oauth",
      {
        bsonType: "object",
        required: ["_id", "verifier", "expiresAt"],
        properties: {
          _id: { bsonType: "string" },
          verifier: { bsonType: "string" },
          expiresAt: { bsonType: "date" },
        },
      },
    ],
  ];
  for (const [name, schema] of definitions) {
    try {
      await db.createCollection(name, { validator: { $jsonSchema: schema } });
    } catch (e) {
      if (e?.code !== 48) throw e;
    }
  }
  try {
    await db.collection("sessions").dropIndex("id_1");
  } catch {}
  await db
    .collection("sessions")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db
    .collection("oauth")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db
    .collection("private_files.files")
    .createIndex({ "metadata.assetId": 1 }, { unique: true });
}

export async function connectDb(uri, name) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(name);
  await initDb(db);
  return { client, db };
}

export function assertWorkspaceSize(state) {
  if (BSON.calculateObjectSize({ state }) > 12 * 1024 * 1024)
    throw new Error(
      "Workspace is approaching capacity. Export/archive records before adding more data.",
    );
}


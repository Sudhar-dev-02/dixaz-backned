import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connectDb, stores } from "../models/db.js";
import { createApp } from "../server.js";
import { hash } from "../routes/auth.js";
import { today } from "../services/office.js";

const mongo = await MongoMemoryServer.create();
const { client: connection, db } = await connectDb(
  mongo.getUri(),
  "dixaz_integration",
);
const origin = "http://localhost:5173";
const app = createApp(db, {
  origin,
  production: false,
  mongoUri: mongo.getUri(),
  dbName: "dixaz_integration",
  ownerEmail: "owner@example.com",
  googleId: "",
  googleSecret: "",
  port: 0,
});
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const addr = server.address();
const base = "http://127.0.0.1:" + addr.port;

async function session(id, email) {
  await stores(db).sessions.insertOne({
    _id: hash(id),
    user: { userId: "google:" + id, email, displayName: email, fullName: null },
    expiresAt: new Date(Date.now() + 3600000),
  });
  return "dixaz_session=" + id;
}

async function req(
  path,
  cookie = "",
  method = "GET",
  body,
  expected = 200,
  customOrigin = origin,
) {
  const res = await fetch(base + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookie,
      Origin: customOrigin,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(res.status, expected, path + " " + (await res.clone().text()));
  return res;
}

async function state(cookie) {
  return (await req("/api/office", cookie)).json();
}

async function action(
  cookie,
  name,
  payload,
  expected = 200,
) {
  const s = await state(cookie);
  return (
    await req(
      "/api/office",
      cookie,
      "POST",
      { action: name, payload, revision: s.revision },
      expected,
    )
  ).json();
}

try {
  await req("/api/office", "", "GET", undefined, 401);
  const fake = await fetch(base + "/api/office", {
    headers: {
      "oai-authenticated-user-id": "owner",
      "oai-authenticated-user-email": "owner@example.com",
    },
  });
  assert.equal(fake.status, 401);
  const outsider = await session("outsider", "outsider@example.com");
  await req("/api/office", outsider, "GET", undefined, 403);
  const owner = await session("owner", "owner@example.com");
  const first = await state(owner);
  assert.equal(first.actor.role, "super_admin");
  assert.equal(first.state.services.length, 13);
  await req(
    "/api/office",
    owner,
    "POST",
    { action: "monthly", payload: {}, revision: first.revision },
    403,
    "https://evil.example",
  );
  await action(owner, "client", {
    name: "Test Client",
    email: "client@example.com",
    contact: "Contact",
    phone: "+919876543210",
    whatsapp: "+919000000001",
    address: "Client address",
    gst: "",
    packageId: "",
    billingDay: 1,
    active: true,
    notes: "private finance note",
    onboardingDate: today(),
    serviceIds: [first.state.services[0].id],
  });
  let data = (await state(owner)).state;
  const cid = data.clients[0].id;
  for (const [name, email, role, clientId] of [
    ["HR", "hr@example.com", "hr", ""],
    ["Employee", "employee@example.com", "employee", ""],
    ["Client", "client@example.com", "client", cid],
  ])
    await action(owner, "member", {
      name,
      email,
      role,
      clientId,
      designation: "",
      active: true,
    });
  const hr = await session("hr", "hr@example.com"),
    employee = await session("employee", "employee@example.com"),
    customer = await session("client", "client@example.com");
  assert.equal((await state(hr)).actor.role, "hr");
  assert.equal((await state(employee)).actor.role, "employee");
  assert.equal((await state(customer)).state.clients.length, 1);
  data = (await state(owner)).state;
  const employeeId = data.members.find((m) => m.role === "employee").id;
  await action(hr, "project", {
    clientId: cid,
    name: "Video",
    description: "Client summary",
    due: today(),
    visible: true,
  });
  data = (await state(owner)).state;
  await action(hr, "task", {
    projectId: data.projects[0].id,
    title: "Edit video",
    description: "Internal brief",
    assigneeId: employeeId,
    due: today(),
    priority: "Normal",
    visible: true,
    publicSummary: "Editing",
    referenceUrl: "https://example.com/reference",
  });
  data = (await state(owner)).state;
  const taskId = data.tasks[0].id;
  await action(employee, "workLog", {
    taskId,
    date: today(),
    summary: "Edit completed",
    blocker: "",
    useTimer: false,
    start: "00:00",
    end: "00:01",
    workKind: "Initial work",
    correctionNote: "",
    status: "Completed",
    progress: 100,
  });
  data = (await state(owner)).state;
  await action(hr, "task", {
    ...data.tasks[0],
    reopen: true,
    correction: "Change text at 00:15",
  });
  assert.equal((await state(employee)).state.tasks[0].status, "In progress");
  assert.equal((await state(customer)).state.tasks[0].history.length, 0);
  const invoice = {
    kind: "invoice",
    clientId: cid,
    date: today(),
    due: today(),
    month: today().slice(0, 7),
    workStart: today(),
    workEnd: today(),
    discount: 0,
    tax: 0,
    terms: "",
    items: [
      { code: "2014", description: "Video", quantity: 30, rate: 750 },
      { code: "2015", description: "Post", quantity: 10, rate: 350 },
    ],
  };
  await action(owner, "document", invoice);
  await action(hr, "document", invoice);
  data = (await state(owner)).state;
  assert.equal(data.documents[0].total, 26000);
  assert.notEqual(data.documents[0].number, data.documents[1].number);
  await req(
    "/api/documents/" + data.documents[0].id,
    customer,
    "GET",
    undefined,
    404,
  );
  await action(owner, "publish", { id: data.documents[0].id });
  await req("/api/documents/" + data.documents[0].id, customer);
  const empState = (await state(employee)).state;
  assert.equal(empState.documents.length, 0);
  assert.equal(empState.clients.length, 0);
  assert.equal(empState.services.length, 13);
  assert(empState.services.every((s) => s.price === null));
  await action(employee, "document", invoice, 400);
  await action(hr, "settings", data.settings, 400);
  const before = data.clients.length;
  await action(hr, "requestChange", {
    action: "client",
    payload: {
      ...data.clients[0],
      id: undefined,
      email: "second@example.com",
      name: "Second client",
    },
    reason: "New contract",
  });
  data = (await state(owner)).state;
  assert.equal(data.clients.length, before);
  await action(
    hr,
    "requestDecision",
    { id: data.requests[0].id, approve: true, note: "" },
    400,
  );
  await action(owner, "requestDecision", {
    id: data.requests[0].id,
    approve: true,
    note: "Approved",
  });
  assert.equal((await state(owner)).state.clients.length, before + 1);
  // Both writers use the same revision: only one service mutation can commit.
  const current = await state(owner);
  const svc = {
    ...current.state.services[0],
    id: undefined,
    name: "New service",
  };
  const attempts = await Promise.all(
    [1, 2].map((n) =>
      fetch(base + "/api/office", {
        method: "POST",
        headers: {
          Cookie: owner,
          Origin: origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "service",
          payload: { ...svc, name: svc.name + n },
          revision: current.revision,
        }),
      }),
    ),
  );
  assert.deepEqual(attempts.map((x) => x.status).sort(), [200, 409]);
  // Real GridFS upload and byte-for-byte read, with role checks.
  const form = new FormData();
  form.set("kind", "resume");
  form.set("targetId", employeeId);
  form.set(
    "file",
    new Blob(["%PDF-1.4\nTest resume"], { type: "application/pdf" }),
    "resume.pdf",
  );
  const upload = await fetch(base + "/api/files", {
    method: "POST",
    headers: { Cookie: employee, Origin: origin },
    body: form,
  });
  assert.equal(upload.status, 201, await upload.clone().text());
  const file = await upload.json();
  assert.equal(
    await (await req("/api/files/" + file.asset.id, employee)).text(),
    "%PDF-1.4\nTest resume",
  );
  await req("/api/files/" + file.asset.id, customer, "GET", undefined, 404);
  await req("/api/files/" + file.asset.id, hr);
  const qr = new FormData();
  qr.set("kind", "paymentQR");
  qr.set("targetId", "business");
  qr.set(
    "file",
    new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
      type: "image/png",
    }),
    "qr.png",
  );
  const denied = await fetch(base + "/api/files", {
    method: "POST",
    headers: { Cookie: hr, Origin: origin },
    body: qr,
  });
  assert.equal(denied.status, 403);
  await req(
    "/auth/callback/google?state=bad&code=bad",
    "",
    "GET",
    undefined,
    400,
  );
  await req("/auth/google", "", "GET", undefined, 503);
  await req(
    "/auth/logout",
    employee,
    "POST",
    undefined,
    403,
    "https://evil.example",
  );
  await req("/auth/logout", employee, "POST", undefined, 303);
  await req("/api/office", employee, "GET", undefined, 401);
  // Confirm persisted data can be read by a second Mongo client.
  const second = await connectDb(mongo.getUri(), "dixaz_integration");
  assert.equal(
    (await stores(second.db).workspaces.findOne({ _id: "main" })).state
      .documents.length,
    2,
  );
  await second.client.close();
  console.log(
    "PASS: live Express + MongoDB integration, owner initialization, sessions, RBAC, approvals, task history, invoices, concurrent writes, GridFS round-trip/isolation, CSRF, OAuth rejection and logout.",
  );
} finally {
  await new Promise((r) => server.close(() => r()));
  await connection.close();
  await mongo.stop();
}

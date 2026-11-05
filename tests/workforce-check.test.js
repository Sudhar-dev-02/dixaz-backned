import assert from "node:assert/strict";
import { blank, today } from "../services/office.js";
import {
  applyAuthorized as A,
  filtered as F,
  normalize,
  canUploadAsset,
} from "../utils/access.js";

const RealDate = Date;
// Fix time for reliable IST interval / midnight assertions.
class TestDate extends RealDate {
  constructor(...args) {
    super(args.length ? args[0] : "2026-10-30T12:00:00Z");
  }
  static now() {
    return new RealDate("2026-10-30T12:00:00Z").getTime();
  }
}
globalThis.Date = TestDate;

try {
  const admin = {
    role: "super_admin",
    memberId: "owner",
    name: "Owner",
    email: "owner@example.com",
    clientId: "",
  };
  let s = blank();
  for (const [name, email] of [
    ["A", "a@example.com"],
    ["B", "b@example.com"],
  ])
    s = A(s, admin, "member", {
      name,
      email,
      role: "employee",
      clientId: "",
      designation: "Editor",
      active: true,
      employeeCode: "HACK",
    });
  assert.equal(s.members[0].employeeCode, "DIXAZ00001");
  assert.equal(s.members[1].employeeCode, "DIXAZ00002");
  const employee = {
    role: "employee",
    memberId: s.members[0].id,
    name: "A",
    email: "a@example.com",
    clientId: "",
  };
  const hr = { ...admin, role: "hr", memberId: "hr" };
  s = A(s, admin, "client", {
    name: "Client",
    email: "c@example.com",
    phone: "1234567890",
    address: "",
    contact: "",
    gst: "",
    packageId: "",
    billingDay: 1,
    active: true,
    notes: "",
  });
  s = A(s, hr, "project", {
    clientId: s.clients[0].id,
    name: "AI reels",
    description: "",
    due: today(),
    visible: true,
  });
  s = A(s, hr, "task", {
    projectId: s.projects[0].id,
    serviceId: s.services[0].id,
    title: "Edit reel",
    description: "Edit",
    assigneeId: employee.memberId,
    due: today(),
    priority: "High",
    visible: true,
    publicSummary: "",
  });
  const taskId = s.tasks[0].id;
  const profile = {
    id: employee.memberId,
    name: "A",
    phone: "1234567890",
    whatsapp: "9876543210",
    dob: "2001-01-01",
    address: "Home",
    designation: "Editor",
    joiningDate: "2026-10-01",
    employmentType: "On-role",
    bio: "",
  };
  assert.throws(() => A(s, employee, "profile", profile));
  s = A(s, hr, "profile", profile);
  s = A(s, employee, "profile", { ...profile, employeeCode: "HACK" });
  assert.equal(s.members[0].employeeCode, "DIXAZ00001");
  assert.throws(() =>
    A(s, employee, "profile", { ...profile, dob: "2099-01-01" }),
  );
  const log = {
    taskId,
    useTimer: false,
    start: "10:00",
    end: "12:00",
    summary: "First edit",
    blocker: "",
    workKind: "Initial work",
    correctionNote: "",
    status: "Completed",
    progress: 100,
    date: "1999-01-01",
    hours: 999,
  };
  s = A(s, employee, "workLog", log);
  assert.equal(s.updates[0].date, today());
  assert.equal(s.updates[0].hours, 2);
  assert.throws(() => A(s, employee, "workLog", log));
  s = A(s, employee, "submitWork", { taskId, url: "https://example.com/reel" });
  assert.equal(s.tasks[0].reviewState, "Submitted");
  assert.throws(() =>
    A(s, employee, "reviewWork", { taskId, decision: "Approved", note: "" }),
  );
  s = A(s, hr, "reviewWork", {
    taskId,
    decision: "Changes requested",
    note: "Replace title at 00:15",
  });
  assert.equal(s.tasks[0].status, "In progress");
  assert.throws(() =>
    A(s, employee, "workLog", { ...log, start: "14:00", end: "14:30" }),
  );
  s = A(s, employee, "workLog", {
    ...log,
    start: "14:00",
    end: "14:30",
    workKind: "Correction",
    correctionNote: "Replaced opening title",
  });
  assert.equal(
    s.updates.reduce((n, u) => n + u.hours, 0),
    2.5,
  );
  assert.equal(s.updates[0].summary, "First edit");
  s = A(s, employee, "submitWork", {
    taskId,
    url: "https://example.com/reel-v2",
  });
  s = A(s, hr, "reviewWork", {
    taskId,
    decision: "Approved",
    note: "Looks good",
  });
  assert.throws(() => A(s, employee, "timerStart", { taskId }));
  s = A(s, hr, "reviewWork", {
    taskId,
    decision: "Changes requested",
    note: "Update CTA",
  });
  s = A(s, employee, "timerStart", { taskId });
  assert.throws(() => A(s, employee, "timerStart", { taskId }));
  s.timers[0].runningSince = "2026-10-30T10:00:00Z";
  s = A(s, employee, "timerPause", { taskId });
  assert.equal(s.timers[0].runningSince, null);
  s = A(s, employee, "workLog", {
    ...log,
    useTimer: true,
    workKind: "Correction",
    correctionNote: "CTA updated",
  });
  assert.equal(s.timers.length, 0);
  assert.equal(s.updates.at(-1).hours, 2);
  assert.throws(() =>
    A(s, employee, "workLog", {
      ...log,
      start: "20:00",
      end: "21:00",
      workKind: "Correction",
      correctionNote: "x",
    }),
  );
  assert.throws(() =>
    A(s, { ...employee, memberId: s.members[1].id }, "workLog", log),
  );
  s = A(s, employee, "leaveRequest", {
    from: "2026-11-01",
    to: "2026-11-02",
    reason: "Family",
  });
  assert.throws(() =>
    A(s, employee, "leaveDecision", {
      id: s.leaves[0].id,
      approve: true,
      note: "",
    }),
  );
  s = A(s, hr, "leaveDecision", {
    id: s.leaves[0].id,
    approve: true,
    note: "Approved",
  });
  assert.equal(s.leaves[0].status, "Approved");
  const other = F(s, { ...employee, memberId: s.members[1].id });
  assert.equal(other.leaves.length, 0);
  assert.equal(other.updates.length, 0);
  assert.equal(other.tasks.length, 0);
  const own = F(s, employee);
  assert.equal(own.services.length, 13);
  assert(own.services.every(s => s.price === null && s.offerPrice === null));
  assert.equal(own.documents.length, 0);
  assert.ok(own.tasks[0].serviceCode);
  const client = F(s, {
    ...employee,
    role: "client",
    clientId: s.clients[0].id,
  });
  assert.equal(client.tasks[0].submissionUrl, "");
  assert.equal(client.leaves.length, 0);
  assert.equal(client.updates.length, 0);
  assert.equal(
    canUploadAsset(s, employee, "appointment", employee.memberId),
    false,
  );
  assert.equal(canUploadAsset(s, hr, "appointment", employee.memberId), true);
  const old = structuredClone(s);
  delete old.employeeSeq;
  old.members.forEach((m) => delete m.employeeCode);
  const n = normalize(old);
  assert.deepEqual(normalize(n).members, n.members);
  console.log(
    "PASS: immutable employee IDs, manager-only joining date, DOB, service snapshots, IST date lock, timed logs, overlap/future rejection, correction totals, submit/review/approve, timer isolation, leave decisions and role privacy.",
  );
} finally {
  globalThis.Date = RealDate;
}


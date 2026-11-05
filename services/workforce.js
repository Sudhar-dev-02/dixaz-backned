import { z } from "zod";
import { today } from "./office.js";

const text = z.string().trim().max(5000),
  date = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (d) =>
        !isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d,
    );
const link = z.union([
  z.literal(""),
  z
    .string()
    .url()
    .max(2000)
    .refine((s) => /^https?:\/\//.test(s)),
]);

export function workforceAction(v, a, action, p) {
  if (
    ![
      "timerStart",
      "timerPause",
      "timerResume",
      "workLog",
      "submitWork",
      "reviewWork",
      "leaveRequest",
      "leaveDecision",
      "readNotices",
    ].includes(action)
  )
    return null;
  const manager = a.role === "hr" || a.role === "super_admin",
    employee = a.role === "employee";
  if (!manager && !employee) throw Error("Employee workspace access required");
  v.timers ??= [];
  v.leaves ??= [];
  v.readNotices ??= {};
  const now = new Date(),
    stamp = now.toISOString();
  const event = (t, kind, note) => {
    t.history ??= [];
    t.history.push({
      id: crypto.randomUUID(),
      at: stamp,
      actorId: a.memberId,
      actorName: a.name,
      kind,
      note,
      status: t.status,
      progress: t.progress,
    });
  };
  const assigned = () => {
    const t = v.tasks.find(
      (t) => t.id === p.taskId && t.assigneeId === a.memberId,
    );
    if (!employee || !t) throw Error("Only your assigned task can be updated");
    if (t.reviewState === "Approved")
      throw Error("HR must reopen approved work before editing");
    return t;
  };
  const timer = () => v.timers.find((t) => t.memberId === a.memberId);
  if (action === "readNotices") {
    const ids = z.array(z.string().max(150)).max(200).parse(p.ids);
    v.readNotices[a.memberId] = Array.from(
      new Set([...(v.readNotices[a.memberId] || []), ...ids]),
    ).slice(-500);
    return v;
  }
  if (action === "leaveRequest") {
    if (!employee) throw Error("Only employees may request leave");
    const x = z.object({ from: date, to: date, reason: text.min(1) }).parse(p);
    if (x.from < today() || x.to < x.from)
      throw Error("Choose a valid current or future leave period");
    if (
      v.leaves.some(
        (l) =>
          l.memberId === a.memberId &&
          l.status !== "Rejected" &&
          x.from <= l.to &&
          x.to >= l.from,
      )
    )
      throw Error("Leave request overlaps an existing request");
    v.leaves.push({
      ...x,
      id: crypto.randomUUID(),
      memberId: a.memberId,
      status: "Pending",
      createdAt: stamp,
    });
    return v;
  }
  if (action === "leaveDecision") {
    if (!manager) throw Error("Only HR / owner can decide leave");
    const x = z
        .object({ id: z.string(), approve: z.boolean(), note: text })
        .parse(p),
      l = v.leaves.find((l) => l.id === x.id);
    if (!l || l.status !== "Pending" || l.memberId === a.memberId)
      throw Error("Request unavailable");
    l.status = x.approve ? "Approved" : "Rejected";
    l.decision = x.note;
    l.reviewedBy = a.name;
    return v;
  }
  if (action === "reviewWork") {
    if (!manager) throw Error("Only HR / owner can review submissions");
    const x = z
        .object({
          taskId: z.string(),
          decision: z.enum(["Approved", "Changes requested"]),
          note: text,
        })
        .parse(p),
      t = v.tasks.find((t) => t.id === x.taskId);
    if (!t) throw Error("Task unavailable");
    if (x.decision === "Approved" && t.reviewState !== "Submitted")
      throw Error("Employee must submit work before approval");
    if (x.decision === "Changes requested" && !x.note)
      throw Error("Add a correction note");
    if (v.timers.some((timer) => timer.taskId === t.id))
      throw Error("Employee must save the active work timer before review");
    t.reviewState = x.decision;
    t.status = x.decision === "Approved" ? "Completed" : "In progress";
    t.progress = x.decision === "Approved" ? 100 : Math.min(99, t.progress);
    event(t, x.decision, x.note || "Work approved");
    return v;
  }
  const t = assigned();
  if (action === "submitWork") {
    if (timer()?.taskId === t.id)
      throw Error("Save the timer before submitting");
    const url = link.parse(p.url);
    if (!url) throw Error("Add a submission link");
    if (t.reviewState === "Submitted")
      throw Error("Already submitted for HR review");
    t.submissionUrl = url;
    t.reviewState = "Submitted";
    t.status = "Review";
    t.progress = 100;
    event(t, "Submitted for review", url);
    return v;
  }
  if (t.reviewState === "Submitted")
    throw Error("Await HR review before adding more work");
  if (action === "timerStart") {
    if (timer())
      throw Error("Save your current timer before starting another task");
    v.timers.push({
      memberId: a.memberId,
      taskId: t.id,
      runningSince: stamp,
      startedAt: stamp,
      segments: [],
    });
    t.status = "In progress";
    return v;
  }
  if (action === "timerPause" || action === "timerResume") {
    const x = timer();
    if (!x || x.taskId !== t.id) throw Error("Timer unavailable");
    if (action === "timerPause") {
      if (!x.runningSince) throw Error("Timer already paused");
      x.segments.push({ start: x.runningSince, end: stamp });
      x.runningSince = null;
    } else {
      if (x.runningSince) throw Error("Timer already running");
      x.runningSince = stamp;
    }
    return v;
  }
  const x = z
    .object({
      summary: text.min(1),
      blocker: text.default(""),
      workKind: z.enum(["Initial work", "Correction"]),
      correctionNote: text.default(""),
      progress: z.coerce.number().min(0).max(100),
      status: z.enum(["Pending", "In progress", "Blocked", "Completed"]),
      useTimer: z.boolean(),
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .parse(p);
  if (t.reviewState === "Changes requested" && x.workKind !== "Correction")
    throw Error("Log requested changes as correction work");
  if (x.workKind === "Correction" && !x.correctionNote)
    throw Error("Describe the correction you completed");
  let segments = [];
  if (x.useTimer) {
    const tm = timer();
    if (!tm || tm.taskId !== t.id) throw Error("Timer unavailable");
    segments = [
      ...tm.segments,
      ...(tm.runningSince ? [{ start: tm.runningSince, end: stamp }] : []),
    ];
  } else {
    if (timer())
      throw Error("Save your current timer before manually logging time");
    const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
    const start = time.parse(x.start),
      end = time.parse(x.end);
    segments = [
      {
        start: new Date(today() + "T" + start + ":00+05:30").toISOString(),
        end: new Date(today() + "T" + end + ":00+05:30").toISOString(),
      },
    ];
  }
  const seconds = segments.reduce(
    (n, s) => n + (Date.parse(s.end) - Date.parse(s.start)) / 1000,
    0,
  );
  if (
    !segments.length ||
    seconds <= 0 ||
    seconds > 86400 ||
    segments.some(
      (s) =>
        Date.parse(s.end) <= Date.parse(s.start) ||
        Date.parse(s.end) > now.getTime(),
    )
  )
    throw Error("Use a positive, non-future work interval of at most 24 hours");
  if (
    v.updates.some(
      (u) =>
        u.memberId === a.memberId &&
        (u.segments || []).some((old) =>
          segments.some((s) => s.start < old.end && s.end > old.start),
        ),
    )
  )
    throw Error("Work time overlaps an existing entry");
  if (
    (v.operations?.unassigned || [])
      .filter((r) => r.memberId === a.memberId)
      .flatMap((r) => r.entries)
      .some((e) =>
        segments.some(
          (g) =>
            g.start < new Date(e.date + "T" + e.end + ":00+05:30").toISOString() &&
            g.end > new Date(e.date + "T" + e.start + ":00+05:30").toISOString(),
        ),
      )
  )
    throw Error("Work overlaps unassigned work");
  const hours = seconds / 3600;
  if (
    v.updates
      .filter((u) => u.memberId === a.memberId && u.date === today())
      .reduce((n, u) => n + u.hours, 0) +
      hours >
    24
  )
    throw Error("Daily work exceeds 24 hours");
  v.updates.push({
    id: crypto.randomUUID(),
    taskId: t.id,
    memberId: a.memberId,
    date: today(),
    createdAt: stamp,
    summary: x.summary,
    blocker: x.blocker,
    hours,
    status: x.status,
    progress: x.status === "Completed" ? 100 : Math.min(99, x.progress),
    startAt: segments[0].start,
    endAt: segments.at(-1).end,
    segments,
    workKind: x.workKind,
    correctionNote: x.correctionNote,
  });
  t.status = x.status;
  t.progress = x.status === "Completed" ? 100 : Math.min(99, x.progress);
  event(
    t,
    x.workKind === "Correction" ? "Correction completed" : "Work logged",
    x.summary +
      (x.correctionNote ? "\nCorrection: " + x.correctionNote : "") +
      (x.blocker ? "\nBlocker: " + x.blocker : ""),
  );
  if (x.useTimer)
    v.timers = v.timers.filter((tm) => tm.memberId !== a.memberId);
  return v;
}


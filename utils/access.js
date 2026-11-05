import { operationsAction, opsView, blankOps, appendMessage } from "../services/operations.js";
import { workforceAction } from "../services/workforce.js";
import { z } from "zod";
import { blank, apply, today } from "../services/office.js";
import { defaultServices } from "./catalogue.js";

export function normalize(s) {
  const v = {
    ...blank(),
    ...s,
    requests: s.requests || [],
    services: s.services ?? defaultServices(),
    assets: s.assets || [],
    members: s.members || [],
    projects: s.projects || [],
    tasks: s.tasks || [],
    updates: s.updates || [],
  };
  v.employeeSeq = Math.max(
    s.employeeSeq || 0,
    ...v.members.map((m) =>
      Number(m.employeeCode?.match(/^DIXAZ(\d+)$/)?.[1] || 0),
    ),
  );
  v.members = v.members.map((m) => ({
    ...m,
    employeeCode:
      m.employeeCode ||
      (m.role !== "client"
        ? "DIXAZ" + String(++v.employeeSeq).padStart(5, "0")
        : undefined),
  }));
  const used = new Set(v.services.map((x) => x.code).filter(Boolean));
  let next = 2001;
  v.services = v.services.map((x) => {
    if (x.code) return x;
    while (used.has(String(next))) next++;
    const code = String(next++);
    used.add(code);
    return { ...x, code };
  });
  v.clientSeq = Math.max(
    s.clientSeq || 0,
    ...v.clients.map((c) => Number(c.regNo?.match(/^DX-CL-(\d+)$/)?.[1] || 0)),
  );
  v.clients = v.clients.map((c) => ({
    ...c,
    onboardingDate: c.onboardingDate || "",
    whatsapp: c.whatsapp || "",
    serviceIds: c.serviceIds || [],
    regNo: c.regNo || "DX-CL-" + String(++v.clientSeq).padStart(5, "0"),
  }));
  v.tasks = v.tasks.map((t) => ({
    ...t,
    history: t.history || [],
    referenceUrl: t.referenceUrl || "",
    status: t.status === "To do" ? "Pending" : t.status,
  }));
  return v;
}

export function actorFor(s, user, owner) {
  if (user.userId === owner)
    return {
      role: "super_admin",
      memberId: "owner",
      name: user.displayName,
      email: user.email,
      clientId: "",
    };
  const m = s.members.find(
    (x) =>
      x.active &&
      (x.userId
        ? x.userId === user.userId
        : x.email.toLowerCase() === user.email.toLowerCase()),
  );
  if (
    !m ||
    !["hr", "employee", "client"].includes(m.role) ||
    (m.role === "client" &&
      !s.clients.some((c) => c.id === m.clientId && c.active))
  )
    return null;
  return {
    role: m.role,
    memberId: m.id,
    name: m.name,
    email: m.email,
    clientId: m.clientId,
  };
}

export function filtered(s, a) {
  if (a.role === "super_admin") return s;
  const v = blank();
  v.operations = opsView(s.operations || blankOps(), a);
  v.services = [];
  v.assets = s.assets.filter((x) => canReadAsset(s, a, x));
  v.settings = {
    ...v.settings,
    name: s.settings.name,
    address: "",
    email: "",
    phone: "",
    gst: "",
    payment: "",
    terms: "",
  };
  const safeMember = (m) => ({
    ...m,
    userId: undefined,
  });
  if (a.role === "hr") {
    Object.assign(v, {
      services: s.services,
      clients: s.clients,
      packages: s.packages,
      documents: s.documents,
      followups: s.followups,
      settings: s.settings,
      requests: s.requests.filter((r) => r.requestedBy === a.memberId),
    });
    v.members = s.members
      .filter((m) => m.role === "employee" || m.id === a.memberId)
      .map(safeMember);
    v.projects = s.projects;
    v.tasks = s.tasks;
    v.updates = s.updates;
    v.leaves = s.leaves;
    v.timers = s.timers;
    v.readNotices = { [a.memberId]: s.readNotices?.[a.memberId] || [] };
    return v;
  }
  if (a.role === "employee") {
    v.services = s.services.map((svc) => ({
      ...svc,
      price: null,
      offerPrice: null,
      offerName: "",
      offerStart: "",
      offerEnd: "",
      history: [],
    }));
    v.members = s.members.filter((m) => m.id === a.memberId).map(safeMember);
    v.tasks = s.tasks.filter((t) => t.assigneeId === a.memberId);
    v.projects = s.projects
      .filter((p) => v.tasks.some((t) => t.projectId === p.id))
      .map((p) => ({
        ...p,
        clientId: "",
        description: "",
        clientName: s.clients.find((c) => c.id === p.clientId)?.name || "",
      }));
    v.updates = s.updates.filter((u) => u.memberId === a.memberId);
    v.leaves = (s.leaves || []).filter((l) => l.memberId === a.memberId);
    v.timers = (s.timers || []).filter((t) => t.memberId === a.memberId);
    v.readNotices = { [a.memberId]: s.readNotices?.[a.memberId] || [] };
    return v;
  }
  const c = s.clients.find((c) => c.id === a.clientId);
  if (!c) return v;
  v.clients = [{ ...c, notes: "" }];
  v.services = s.services
    .filter((svc) => c.serviceIds?.includes(svc.id))
    .map((svc) => ({
      ...svc,
      description: "",
      price: null,
      offerPrice: null,
      offerName: "",
      offerStart: "",
      offerEnd: "",
      history: [],
    }));
  v.packages = s.packages.filter((p) => p.id === c.packageId);
  v.projects = s.projects.filter((p) => p.clientId === c.id && p.visible);
  v.tasks = s.tasks
    .filter((t) => t.visible && v.projects.some((p) => p.id === t.projectId))
    .map((t) => ({
      ...t,
      description: "",
      assigneeId: "",
      referenceUrl: "",
      history: [],
      submissionUrl: "",
      reviewState: undefined,
    }));
  v.documents = s.documents
    .filter((d) => d.clientId === c.id && d.status !== "Draft")
    .map((d) => ({
      ...d,
      client: { ...d.client, notes: "" },
      payments: d.payments.map((p) => ({ ...p, reference: "" })),
    }));
  return v;
}

const text = z.string().trim().max(5000);
const id = z.string().max(100);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  );
const statuses = [
  "Pending",
  "In progress",
  "Blocked",
  "Review",
  "Completed",
];

export function applyAuthorized(s, a, action, p) {
  const v = structuredClone(s);
  const manager = a.role === "super_admin" || a.role === "hr";
  const operation = operationsAction(v, a, action, p);
  if (operation) return operation;
  const workforce = workforceAction(v, a, action, p);
  if (workforce) {
    if (action === "reviewWork") {
      const t = v.tasks.find((t) => t.id === p.taskId);
      if (t)
        appendMessage(
          v,
          a,
          t.assigneeId,
          t.title + ": " + p.decision + ". " + (p.note || ""),
          t.id,
        );
    }
    return workforce;
  }
  if (action === "requestDecision") {
    if (a.role !== "super_admin")
      throw new Error("Only the owner can approve requests");
    const x = z.object({ id, approve: z.boolean(), note: text }).parse(p);
    const request = v.requests.find((r) => r.id === x.id);
    if (!request || request.status !== "Pending")
      throw new Error("Request already reviewed or unavailable");
    if (x.approve) {
      const current =
        request.action === "client" || request.action === "removeClient"
          ? v.clients.find((c) => c.id === request.payload.id)
          : v.members.find((m) => m.id === request.payload.id);
      if (JSON.stringify(current || null) !== request.before)
        throw new Error(
          "Record changed since request. Reject it and ask HR to submit again.",
        );
      const result = applyAuthorized(v, a, request.action, request.payload);
      const r = result.requests.find((r) => r.id === x.id);
      Object.assign(r, {
        status: "Approved",
        reviewedAt: new Date().toISOString(),
        reviewedBy: a.name,
        decision: x.note,
      });
      return result;
    }
    Object.assign(request, {
      status: "Rejected",
      reviewedAt: new Date().toISOString(),
      reviewedBy: a.name,
      decision: x.note,
    });
    return v;
  }
  if (action === "requestChange") {
    if (a.role !== "hr") throw new Error("Only HR can raise a request");
    const x = z
      .object({
        action: z.enum(["client", "member", "removeClient", "removeMember"]),
        payload: z.record(z.unknown()),
        reason: text.min(1),
      })
      .parse(p);
    const old =
      x.action === "client" || x.action === "removeClient"
        ? v.clients.find((c) => c.id === x.payload.id)
        : v.members.find((m) => m.id === x.payload.id);
    if (
      (x.action === "member" && x.payload.role !== "employee") ||
      ((x.action === "member" || x.action === "removeMember") &&
        old &&
        "role" in old &&
        old.role !== "employee")
    )
      throw new Error("HR may request employee account changes only");
    applyAuthorized(
      v,
      {
        role: "super_admin",
        memberId: "owner",
        email: a.email,
        name: a.name,
        clientId: "",
      },
      x.action,
      x.payload,
    );
    if (
      v.requests.some(
        (r) =>
          r.status === "Pending" &&
          r.action === x.action &&
          (x.payload.id
            ? r.payload.id === x.payload.id
            : r.payload.email === x.payload.email),
      )
    )
      throw new Error("A matching request is already pending");
    v.requests.push({
      id: crypto.randomUUID(),
      action: x.action,
      payload: x.payload,
      before: JSON.stringify(old || null),
      reason: x.reason,
      requestedBy: a.memberId,
      requestedName: a.name,
      createdAt: new Date().toISOString(),
      status: "Pending",
    });
    return v;
  }
  if (action === "removeClient" || action === "removeMember") {
    if (a.role !== "super_admin") throw new Error("Owner approval required");
    const x = z.object({ id }).parse(p);
    if (action === "removeClient") {
      const c = v.clients.find((c) => c.id === x.id);
      if (!c) throw new Error("Client not found");
      c.active = false;
      v.members.forEach((m) => {
        if (m.role === "client" && m.clientId === c.id) m.active = false;
      });
    } else {
      const m = v.members.find((m) => m.id === x.id);
      if (!m) throw new Error("Account not found");
      m.active = false;
    }
    return v;
  }
  if (action === "profile") {
    const x = z
      .object({
        id,
        name: text.min(1),
        phone: text,
        whatsapp: text.optional(),
        dob: z.union([date, z.literal("")]).optional(),
        address: text,
        designation: text,
        joiningDate: z.union([date, z.literal("")]),
        employmentType: z.enum([
          "",
          "Freelancer",
          "On-role",
          "Temporary",
          "Onsite",
        ]),
        bio: text,
      })
      .parse(p);
    const m = v.members.find((t) => t.id === x.id);
    if (!m || m.role === "client")
      throw new Error("Employee profile not found");
    if (
      !(
        a.role === "super_admin" ||
        (a.role === "hr" && (m.role === "employee" || m.id === a.memberId)) ||
        (a.role === "employee" && m.id === a.memberId)
      )
    )
      throw new Error("You can update only your own profile");
    if (a.role === "employee" && x.joiningDate !== (m.joiningDate || ""))
      throw new Error("Joining date is managed by HR / Super Admin");
    if (x.dob && x.dob > today())
      throw new Error("DOB cannot be in the future");
    Object.assign(m, x);
    return v;
  }
  if (action === "service") {
    if (!manager) throw new Error("Service pricing requires HR or Super Admin");
    const price = z.preprocess(
      (x) => (x === "" || x === null ? null : x),
      z.coerce.number().finite().min(0).max(100000000).nullable(),
    );
    const x = z
      .object({
        id: id.optional(),
        code: z
          .string()
          .trim()
          .regex(/^[0-9]{1,12}$/, "Enter a numeric service code")
          .optional(),
        name: text.min(1),
        description: text,
        price,
        unit: z.enum(["Project", "Month", "Item", "Hour", "Day"]),
        active: z.boolean(),
        offerName: text,
        offerPrice: price,
        offerStart: z.union([date, z.literal("")]),
        offerEnd: z.union([date, z.literal("")]),
      })
      .parse(p);
    if (
      x.offerPrice !== null &&
      (!x.offerStart ||
        !x.offerEnd ||
        x.offerEnd < x.offerStart ||
        x.price === null ||
        x.offerPrice > x.price)
    )
      throw new Error(
        "An offer needs a base price, valid start/end dates, and an offer price no higher than the base price",
      );
    const old = v.services.find((t) => t.id === x.id);
    if (x.id && !old) throw new Error("Service not found");
    const code =
      old?.code ||
      String(Math.max(2000, ...v.services.map((s) => Number(s.code) || 0)) + 1);
    if (v.services.some((t) => t.code === code && t.id !== x.id))
      throw new Error("Service code already exists");
    const item = {
      ...x,
      code,
      id: old?.id || crypto.randomUUID(),
      history: old?.history || [],
    };
    const keys = [
      "price",
      "offerPrice",
      "offerName",
      "offerStart",
      "offerEnd",
    ];
    if (!old || keys.some((k) => old[k] !== x[k]))
      item.history = [
        ...item.history,
        {
          at: new Date().toISOString(),
          price: x.price,
          offerPrice: x.offerPrice,
          offerName: x.offerName,
          offerStart: x.offerStart,
          offerEnd: x.offerEnd,
        },
      ];
    if (old) v.services[v.services.indexOf(old)] = item;
    else v.services.push(item);
    return v;
  }
  if (action === "member") {
    if (a.role !== "super_admin")
      throw new Error("Submit an employee request for owner approval");
    if (!manager) throw new Error("Forbidden");
    const x = z
      .object({
        id: id.optional(),
        name: text.min(1),
        email: z
          .string()
          .email()
          .transform((x) => x.toLowerCase()),
        role: z.enum(["employee", "hr", "client"]),
        clientId: text,
        designation: text,
        active: z.boolean(),
      })
      .parse(p);
    const old = v.members.find((m) => m.id === x.id);
    if (x.id && !old) throw new Error("Member not found");
    if (
      x.email === a.email.toLowerCase() ||
      v.members.some((m) => m.email === x.email && m.id !== x.id)
    )
      throw new Error("Email already has an account");
    if (x.role === "client") {
      const c = v.clients.find((c) => c.id === x.clientId);
      if (!c || c.email.toLowerCase() !== x.email)
        throw new Error("Client login email must match the selected client");
    } else x.clientId = "";
    const member = {
      ...old,
      ...x,
      id: old?.id || crypto.randomUUID(),
      employeeCode:
        old?.employeeCode ||
        (x.role !== "client"
          ? "DIXAZ" + String(++v.employeeSeq).padStart(5, "0")
          : undefined),
      userId: old?.email === x.email ? old.userId : undefined,
    };
    if (old) v.members[v.members.indexOf(old)] = member;
    else v.members.push(member);
    return v;
  }
  if (action === "project") {
    if (!manager)
      throw new Error("Only HR or Super Admin can manage client projects");
    const x = z
      .object({
        id: id.optional(),
        clientId: id,
        name: text.min(1),
        description: text,
        due: date,
        visible: z.boolean(),
      })
      .parse(p);
    if (!v.clients.some((c) => c.id === x.clientId))
      throw new Error("Client not found");
    const old = v.projects.find((t) => t.id === x.id);
    if (x.id && !old) throw new Error("Project not found");
    const proj = { ...x, id: old?.id || crypto.randomUUID() };
    if (old) v.projects[v.projects.indexOf(old)] = proj;
    else v.projects.push(proj);
    return v;
  }
  if (action === "task") {
    if (!manager) throw new Error("Forbidden");
    const x = z
      .object({
        id: id.optional(),
        projectId: id,
        serviceId: id.optional(),
        title: text.min(1),
        description: text,
        assigneeId: id,
        due: date,
        priority: z.enum(["Normal", "High", "Urgent"]),
        visible: z.boolean(),
        publicSummary: text,
        referenceUrl: z
          .union([
            z
              .string()
              .url()
              .refine(
                (v) => /^https?:\/\//.test(v),
                "Use an HTTP or HTTPS link",
              ),
            z.literal(""),
          ])
          .optional(),
        correction: text.optional(),
        reopen: z.boolean().optional(),
      })
      .parse(p);
    if (!v.projects.some((t) => t.id === x.projectId))
      throw new Error("Project not found");
    if (
      !v.members.some(
        (m) => m.id === x.assigneeId && m.role === "employee" && m.active,
      )
    )
      throw new Error("Select an active employee");
    const old = v.tasks.find((t) => t.id === x.id);
    if (x.id && !old) throw new Error("Task not found");
    const service = x.serviceId
      ? v.services.find((s) => s.id === x.serviceId)
      : null;
    if (x.serviceId && !service) throw new Error("Service not found");
    if (
      old &&
      (x.assigneeId !== old.assigneeId || x.reopen) &&
      v.timers.some((tm) => tm.taskId === old.id)
    )
      throw new Error(
        "Employee must save the active timer before reassigning or reopening work",
      );
    const { correction, reopen, ...fields } = x;
    const task = {
      ...old,
      ...fields,
      serviceCode: service?.code || old?.serviceCode,
      serviceName: service?.name || old?.serviceName,
      reviewState: reopen
        ? "Changes requested"
        : old?.reviewState || "Not submitted",
      referenceUrl: x.referenceUrl ?? old?.referenceUrl ?? "",
      id: old?.id || crypto.randomUUID(),
      status: reopen ? "In progress" : old?.status || "Pending",
      progress: reopen ? Math.min(old?.progress || 0, 99) : old?.progress || 0,
      history: [...(old?.history || [])],
    };
    if (reopen && !correction?.trim())
      throw new Error("Explain the correction before reopening");
    task.history.push({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actorId: a.memberId,
      actorName: a.name,
      kind: reopen
        ? "Reopened for corrections"
        : old
          ? "Task updated"
          : "Task assigned",
      note:
        [
          correction,
          old && old.description !== x.description
            ? "Updated brief: " + x.description
            : !old
              ? x.description
              : "",
          old && old.referenceUrl !== task.referenceUrl
            ? "Reference: " + task.referenceUrl
            : "",
          old && old.assigneeId !== x.assigneeId
            ? "Reassigned to " +
              v.members.find((m) => m.id === x.assigneeId)?.name
            : "",
        ]
          .filter(Boolean)
          .join("\n") || "Task details updated",
      status: task.status,
      progress: task.progress,
    });
    if (old) v.tasks[v.tasks.indexOf(old)] = task;
    else v.tasks.push(task);
    appendMessage(
      v,
      a,
      task.assigneeId,
      (old ? "Task updated: " : "New task: ") +
        task.title +
        ". " +
        (correction || task.description),
      task.id,
    );
    return v;
  }
  if (action === "dailyUpdate") {
    if (a.role !== "employee")
      throw new Error(
        "Daily updates must be submitted by the assigned employee",
      );
    const x = z
      .object({
        taskId: id,
        date,
        summary: text.min(1),
        blocker: text,
        hours: z.coerce.number().min(0).max(24),
        status: z.enum(statuses),
        progress: z.coerce.number().int().min(0).max(100),
      })
      .parse(p);
    const task = v.tasks.find(
      (t) => t.id === x.taskId && t.assigneeId === a.memberId,
    );
    if (!task) throw new Error("You can update only your assigned tasks");
    if (x.date !== today())
      throw new Error("Submit updates for today (India time)");
    if (
      (x.status === "Completed" && x.progress !== 100) ||
      (x.status !== "Completed" && x.progress === 100)
    )
      throw new Error("Use Completed with 100% progress");
    if (
      v.updates
        .filter((t) => t.memberId === a.memberId && t.date === x.date)
        .reduce((a, b) => a + b.hours, 0) +
        x.hours >
      24
    )
      throw new Error("Daily logged hours cannot exceed 24");
    v.updates.push({
      ...x,
      id: crypto.randomUUID(),
      memberId: a.memberId,
      createdAt: new Date().toISOString(),
    });
    task.status = x.status;
    task.progress = x.progress;
    task.history = [
      ...(task.history || []),
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        actorId: a.memberId,
        actorName: a.name,
        kind: "Employee update",
        note: x.summary + (x.blocker ? "\nBlocker: " + x.blocker : ""),
        status: x.status,
        progress: x.progress,
      },
    ];
    return v;
  }
  if (action === "taskReview") {
    if (!manager) throw new Error("Forbidden");
    const x = z
      .object({
        id,
        status: z.enum(statuses),
        progress: z.coerce.number().int().min(0).max(100),
        note: text.default(""),
      })
      .parse(p);
    const t = v.tasks.find((t) => t.id === x.id);
    if (!t) throw new Error("Task not found");
    if (
      (x.status === "Completed" && x.progress !== 100) ||
      (x.status !== "Completed" && x.progress === 100)
    )
      throw new Error("Use Completed with 100% progress");
    if (t.status === "Completed" && x.status !== "Completed" && !x.note.trim())
      throw new Error("Add a correction note to reopen this task");
    t.status = x.status;
    t.progress = x.progress;
    t.history = [
      ...(t.history || []),
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        actorId: a.memberId,
        actorName: a.name,
        kind: "HR / owner review",
        note: x.note || "Status reviewed",
        status: x.status,
        progress: x.progress,
      },
    ];
    return v;
  }
  if (
    a.role === "hr" &&
    [
      "package",
      "document",
      "publish",
      "quoteStatus",
      "convert",
      "payment",
      "followup",
      "resolve",
      "monthly",
    ].includes(action)
  )
    return apply(v, action, p);
  if (a.role !== "super_admin")
    throw new Error("Forbidden: this action requires Super Admin");
  return apply(v, action, p);
}

export function canUploadAsset(s, a, kind, targetId) {
  if (kind === "paymentQR")
    return a.role === "super_admin" && targetId === "business";
  if (kind === "clientLogo")
    return (
      s.clients.some((c) => c.id === targetId) &&
      (a.role === "super_admin" ||
        (a.role === "client" && a.clientId === targetId))
    );
  const m = s.members.find((m) => m.id === targetId && m.role !== "client");
  if (!m) return false;
  if (kind === "certificate" || kind === "appointment")
    return (
      a.role === "super_admin" || (a.role === "hr" && m.role === "employee")
    );
  return (
    a.role === "super_admin" ||
    (a.role === "hr" && (m.role === "employee" || m.id === a.memberId)) ||
    (a.role === "employee" && m.id === a.memberId)
  );
}

export function canReadAsset(s, a, file) {
  if (file.kind === "paymentQR")
    return (
      a.role === "super_admin" ||
      a.role === "hr" ||
      (a.role === "client" &&
        s.documents.some(
          (d) =>
            d.clientId === a.clientId &&
            d.status !== "Draft" &&
            d.business.paymentQrId === file.id,
        ))
    );
  if (file.kind === "clientLogo")
    return (
      s.clients.some((c) => c.id === file.targetId) &&
      (a.role === "super_admin" ||
        a.role === "hr" ||
        (a.role === "client" && a.clientId === file.targetId))
    );
  const m = s.members.find((m) => m.id === file.targetId);
  return (
    !!m &&
    (a.role === "super_admin" ||
      (a.role === "hr" && (m.role === "employee" || m.id === a.memberId)) ||
      (a.role === "employee" && m.id === a.memberId))
  );
}


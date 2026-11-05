import { blankOps } from "./operations.js";
import { z } from "zod";
import { defaultServices } from "../utils/catalogue.js";

export const blank = () => ({
  operations: blankOps(),
  employeeSeq: 0,
  timers: [],
  leaves: [],
  readNotices: {},
  requests: [],
  services: defaultServices(),
  assets: [],
  clientSeq: 0,
  members: [],
  projects: [],
  tasks: [],
  updates: [],
  clients: [],
  packages: [],
  documents: [],
  followups: [],
  settings: {
    name: "DIXAZ",
    address: "Polur, Tiruvannamalai, Tamil Nadu 606803",
    email: "",
    phone: "",
    gst: "",
    payment: "",
    terms: "Please mention your invoice number when making a payment.",
  },
  seq: 0,
});

export function seed() {
  const s = blank(),
    d = today();
  s.members = [
    {
      id: "hr-1",
      employeeCode: "DIXAZ00003",
      name: "HR Manager",
      email: "hr@dixaz.com",
      role: "hr",
      clientId: "",
      designation: "HR Manager",
      active: true,
      joiningDate: d,
    },
    {
      id: "emp-1",
      employeeCode: "DIXAZ00001",
      name: "Arun Kumar",
      email: "arun@dixaz.com",
      role: "employee",
      clientId: "",
      designation: "Video editor",
      employmentType: "On-role",
      joiningDate: d,
      active: true,
    },
    {
      id: "emp-2",
      employeeCode: "DIXAZ00002",
      name: "Priya",
      email: "priya@dixaz.com",
      role: "employee",
      clientId: "",
      designation: "Graphic designer",
      employmentType: "Freelancer",
      joiningDate: d,
      active: true,
    },
    {
      id: "client-user-1",
      name: "Ambika Real Estate",
      email: "ambika@example.com",
      role: "client",
      clientId: "client-1",
      active: true,
      joiningDate: d,
    },
  ];
  s.employeeSeq = 3;
  s.clients = [
    {
      id: "client-1",
      regNo: "DX-CL-00001",
      name: "Ambika Real Estate",
      contact: "Client contact",
      email: "ambika@example.com",
      phone: "9000000001",
      whatsapp: "9000000001",
      address: "Polur, Tiruvannamalai, Tamil Nadu 606803",
      gst: "",
      packageId: "package-1",
      billingDay: 1,
      active: true,
      notes: "Sample client",
      onboardingDate: d,
      serviceIds: ["dixaz-service-9", "dixaz-service-11"],
    },
    {
      id: "client-2",
      regNo: "DX-CL-00002",
      name: "PR Traders",
      contact: "Client contact",
      email: "prtraders@example.com",
      phone: "9000000002",
      whatsapp: "9000000002",
      address: "Kolappakkam, Chennai",
      gst: "",
      packageId: "package-2",
      billingDay: 1,
      active: true,
      notes: "Sample client",
      onboardingDate: d,
      serviceIds: ["dixaz-service-8"],
    },
  ];
  s.clientSeq = 2;
  s.packages = [
    {
      id: "package-1",
      name: "Social Media Growth",
      price: 15000,
      cycle: "Monthly",
      description: "Daily reels, post design and monthly reporting",
    },
    {
      id: "package-2",
      name: "Branding & Identity",
      price: 25000,
      cycle: "One-time",
      description: "Logo, brand guidelines, stationery and social templates",
    },
  ];
  s.projects = [
    {
      id: "project-1",
      clientId: "client-1",
      name: "Ambika Nagar campaign",
      description: "Property campaign",
      due: d,
      visible: true,
    },
    {
      id: "project-2",
      clientId: "client-2",
      name: "Social media creatives",
      description: "Brand posts",
      due: d,
      visible: true,
    },
  ];
  s.tasks = [
    {
      id: "task-1",
      projectId: "project-1",
      title: "Ambika Nagar promotional reel",
      serviceId: "dixaz-service-9",
      serviceCode: "2009",
      serviceName: "Video Editing & Content Creation",
      description:
        "Create a 30-second reel with captions and a contact end card.",
      assigneeId: "emp-1",
      due: d,
      priority: "Normal",
      status: "Pending",
      progress: 0,
      visible: true,
      publicSummary: "Reel in production",
      reviewState: "Not submitted",
      history: [],
    },
    {
      id: "task-2",
      projectId: "project-2",
      title: "Festival poster",
      serviceId: "dixaz-service-8",
      serviceCode: "2008",
      serviceName: "Graphic Design & Branding",
      description: "Design a clean 4:5 poster.",
      assigneeId: "emp-2",
      due: d,
      priority: "Normal",
      status: "Pending",
      progress: 0,
      visible: true,
      publicSummary: "Poster scheduled",
      reviewState: "Not submitted",
      history: [],
    },
  ];
  s.documents = [
    {
      id: "doc-sample-1",
      number: "INV-2026-0001",
      kind: "invoice",
      clientId: "client-1",
      client: {
        name: "Ambika Real Estate",
        address: "Polur, Tiruvannamalai, Tamil Nadu 606803",
        email: "ambika@example.com",
        phone: "9000000001",
      },
      date: d,
      due: d,
      workStart: d,
      workEnd: d,
      month: d.slice(0, 7),
      items: [
        {
          serviceId: "dixaz-service-9",
          code: "2009",
          name: "Video Editing & Content Creation",
          rate: 750,
          qty: 10,
          amount: 7500,
        },
      ],
      subtotal: 7500,
      tax: 0,
      total: 7500,
      payments: [
        {
          id: "pay-1",
          amount: 7500,
          date: d,
          mode: "UPI",
          reference: "UPI/2026/001",
        },
      ],
      status: "Paid",
      terms: "Thank you for your business.",
      history: [],
    },
  ];
  s.followups = [
    {
      id: "f-1",
      clientId: "client-1",
      reason: "Campaign review & next month deliverables",
      date: d,
      time: "11:00",
      assignee: "Dinesh",
      notes: "Review reel performance with client",
      done: false,
    },
  ];
  const s2001 = s.services.find((v) => v.code === "2001");
  if (s2001) s2001.price = 8000;
  const s2008 = s.services.find((v) => v.code === "2008");
  if (s2008) s2008.price = 350;
  const s2009 = s.services.find((v) => v.code === "2009");
  if (s2009) s2009.price = 750;
  const s2011 = s.services.find((v) => v.code === "2011");
  if (s2011) s2011.price = 1499;
  s.settings.website = "https://dixaz.in";
  s.settings.name = "DIXAZ";
  s.settings.phone = "+91 9000000000";
  s.settings.email = "contact@dixaz.com";
  s.operations.messages = [
    {
      id: "welcome",
      employeeId: "emp-1",
      senderId: "hr-1",
      senderName: "HR Manager",
      senderRole: "hr",
      text: "Your Ambika Nagar reel is assigned. Open My tasks to get started.",
      taskId: "task-1",
      at: new Date().toISOString(),
      seen: {},
    },
  ];
  return s;
}

export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);

export const paid = (d) => d.payments.reduce((s, p) => s + p.amount, 0);
export const balance = (d) => Math.round((d.total - paid(d)) * 100) / 100;
export const status = (d) =>
  d.kind === "quotation"
    ? d.status
    : d.status === "Draft"
      ? "Draft"
      : balance(d) <= 0
        ? "Paid"
        : d.due < today()
          ? "Overdue"
          : paid(d) > 0
            ? "Partially paid"
            : "Unpaid";

const txt = z.string().trim().max(5000);
const amt = z.coerce.number().finite().min(0).max(100000000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  );
const id = z.string().max(100);
const newId = () => crypto.randomUUID();

export function apply(s, action, input) {
  const v = structuredClone(s);
  const p = input;
  const client = (cid) => {
    const c = v.clients.find((x) => x.id === cid);
    if (!c) throw new Error("Client not found");
    return c;
  };
  const doc = (did) => {
    const d = v.documents.find((x) => x.id === did);
    if (!d) throw new Error("Document not found");
    return d;
  };
  const createDoc = (x) => {
    const c = client(x.clientId);
    const total =
      Math.round((x.subtotal - x.discount) * (1 + x.tax / 100) * 100) / 100;
    if (x.discount > x.subtotal)
      throw new Error("Discount cannot exceed subtotal");
    v.seq = Math.max(
      v.seq,
      ...v.documents.map((d) => Number(d.number.match(/-(\d+)$/)?.[1] || 0)),
    );
    const n = ++v.seq;
    const d = {
      ...x,
      id: newId(),
      number: `DX-${x.kind === "invoice" ? "INV" : "QUO"}-${x.date.slice(0, 4)}-${String(n).padStart(4, "0")}`,
      client: structuredClone(c),
      business: structuredClone(v.settings),
      total,
      status: "Draft",
      payments: [],
    };
    v.documents.push(d);
    return d;
  };

  if (action === "client") {
    const x = z
      .object({
        id: id.optional(),
        name: txt.min(1),
        contact: txt,
        email: z.string().email(),
        phone: z
          .string()
          .regex(/^\+?[0-9 ]{10,16}$/, "Enter phone with country code"),
        address: txt,
        gst: txt,
        packageId: txt,
        billingDay: z.coerce.number().int().min(1).max(28),
        active: z.boolean(),
        notes: txt,
        onboardingDate: z.union([date, z.literal("")]).optional(),
        whatsapp: z
          .union([z.string().regex(/^\+?[0-9 ]{10,16}$/), z.literal("")])
          .optional(),
        serviceIds: z.array(id).max(100).optional(),
      })
      .parse(p);
    const previous = v.clients.find((c) => c.id === x.id);
    x.onboardingDate ??= previous?.onboardingDate || "";
    x.whatsapp ??= previous?.whatsapp || "";
    x.serviceIds ??= previous?.serviceIds || [];
    x.serviceIds = [...new Set(x.serviceIds)];
    if (
      x.serviceIds.some(
        (sid) =>
          !v.services.some(
            (s) =>
              s.id === sid && (s.active || previous?.serviceIds?.includes(sid)),
          ),
      )
    )
      throw new Error("Select valid services");
    if (x.packageId && !v.packages.some((t) => t.id === x.packageId))
      throw new Error("Package not found");
    if (
      v.clients.some(
        (c) => c.email.toLowerCase() === x.email.toLowerCase() && c.id !== x.id,
      )
    )
      throw new Error("Email already assigned to a client");
    const old = v.clients.findIndex((c) => c.id === x.id);
    const regNo =
      old >= 0
        ? v.clients[old].regNo
        : "DX-CL-" + String(++v.clientSeq).padStart(5, "0");
    const c = {
      ...x,
      regNo,
      email: x.email.toLowerCase(),
      id: x.id || newId(),
    };
    if (x.id && old < 0) throw new Error("Client not found");
    if (old >= 0) v.clients[old] = c;
    else v.clients.push(c);
  } else if (action === "package") {
    const x = z
      .object({
        id: id.optional(),
        name: txt.min(1),
        description: txt.min(1),
        price: amt,
        cycle: z.enum(["Monthly", "One-time"]),
      })
      .parse(p);
    const i = v.packages.findIndex((t) => t.id === x.id);
    if (x.id && i < 0) throw new Error("Package not found");
    const pack = { ...x, id: x.id || newId() };
    if (i >= 0) v.packages[i] = pack;
    else v.packages.push(pack);
  } else if (action === "document") {
    const existing = p.id ? doc(z.string().min(1).parse(p.id)) : undefined;
    if (existing && existing.status !== "Draft") throw new Error("Only drafts can be edited");
    if (existing && p.kind !== existing.kind) throw new Error("Document type cannot be changed");
    const x = z
      .object({
        kind: z.enum(["invoice", "quotation"]),
        clientId: id,
        date,
        due: date,
        workStart: date.optional(),
        workEnd: date.optional(),
        month: z.string().regex(/^(\d{4}-\d{2})?$/),
        description: txt.default(""),
        items: z
          .array(
            z.object({
              serviceId: id.optional(),
              code: z.string().trim().max(30),
              description: txt.min(1),
              quantity: z.coerce.number().finite().positive().max(100000),
              rate: amt,
            }),
          )
          .min(1)
          .max(100)
          .optional(),
        subtotal: amt.default(0),
        discount: amt,
        tax: z.coerce.number().min(0).max(100),
        terms: txt,
      })
      .parse(p);
    x.workStart ??= x.date;
    x.workEnd ??= x.workStart;
    if (x.workEnd < x.workStart)
      throw new Error("Work end date must be on or after work start date");
    if (x.items) {
      const items = x.items.map((item) => {
        const service = item.serviceId
          ? v.services.find((s) => s.id === item.serviceId && s.active)
          : null;
        if (item.serviceId && !service) throw new Error("Service unavailable");
        return {
          ...item,
          code: service?.code || item.code,
          amount: Math.round(item.quantity * item.rate * 100) / 100,
        };
      });
      Object.assign(x, {
        items,
        subtotal:
          Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) /
          100,
        description: items.map((i) => i.description).join("\n"),
      });
      if (x.subtotal > 100000000) throw new Error("Subtotal too large");
    } else if (!x.description) throw new Error("Description required");
    if (x.due < x.date)
      throw new Error("Due date must be on or after issue date");
    if (x.tax > 0 && !v.settings.gst)
      throw new Error("Add your GSTIN in Settings before applying tax");
    if (existing) {
      if (x.discount > x.subtotal) throw new Error("Discount cannot exceed subtotal");
      const total = Math.round((x.subtotal - x.discount) * (1 + x.tax / 100) * 100) / 100;
      Object.assign(existing, x, { total, client: structuredClone(client(x.clientId)) });
    } else createDoc(x);
  } else if (action === "publish") {
    const d = doc(z.object({ id }).parse(p).id);
    if (d.status !== "Draft") throw new Error("Already published");
    d.status = d.kind === "invoice" ? "Published" : "Sent";
  } else if (action === "quoteStatus") {
    const x = z
      .object({ id, status: z.enum(["Accepted", "Declined", "Expired"]) })
      .parse(p);
    const d = doc(x.id);
    if (d.kind !== "quotation" || d.status === "Draft")
      throw new Error("Publish quotation first");
    d.status = x.status;
  } else if (action === "convert") {
    const d = doc(z.object({ id }).parse(p).id);
    if (d.kind !== "quotation" || d.status !== "Accepted")
      throw new Error("Accept quotation before conversion");
    if (v.documents.some((t) => t.sourceId === d.id))
      throw new Error("Quotation already converted");
    createDoc({
      kind: "invoice",
      clientId: d.clientId,
      date: today(),
      due: today(),
      month: "",
      workStart: d.workStart,
      workEnd: d.workEnd,
      description: d.description,
      items: d.items ? structuredClone(d.items) : undefined,
      subtotal: d.subtotal,
      discount: d.discount,
      tax: d.tax,
      terms: d.terms,
      sourceId: d.id,
    });
  } else if (action === "payment") {
    const x = z
      .object({
        id,
        amount: amt.refine((n) => n > 0),
        date,
        mode: z.enum(["UPI", "Bank transfer", "Cash", "Other"]),
        reference: txt,
      })
      .parse(p);
    const d = doc(x.id);
    if (d.kind !== "invoice" || d.status === "Draft")
      throw new Error("Publish invoice before recording payment");
    if (x.amount > balance(d))
      throw new Error("Payment exceeds pending balance");
    d.payments.push({
      ...x,
      id: newId(),
      amount: Math.round(x.amount * 100) / 100,
    });
  } else if (action === "followup") {
    const x = z
      .object({
        clientId: id,
        reason: txt.min(1),
        date,
        time: z.string().regex(/^\d{2}:\d{2}$/),
        notes: txt,
        assignee: txt,
      })
      .parse(p);
    client(x.clientId);
    v.followups.push({ ...x, id: newId(), done: false });
  } else if (action === "resolve") {
    const x = z
      .object({ id, nextDate: z.union([date, z.literal("")]), notes: txt })
      .parse(p);
    const f = v.followups.find((t) => t.id === x.id);
    if (!f || f.done)
      throw new Error("Follow-up not found or already completed");
    f.done = true;
    if (x.nextDate)
      v.followups.push({
        ...f,
        id: newId(),
        date: x.nextDate,
        notes: x.notes,
        done: false,
      });
    else f.notes += x.notes ? "\nClosed: " + x.notes : "\nNo further follow-up";
  } else if (action === "settings") {
    v.settings = z
      .object({
        name: txt.min(1),
        address: txt,
        email: z.union([z.string().email(), z.literal("")]),
        phone: txt,
        gst: txt,
        payment: txt,
        terms: txt,
        accountName: txt.optional(),
        bankName: txt.optional(),
        accountNumber: z.string().trim().max(50).optional(),
        ifsc: z.string().trim().max(30).optional(),
        upi: z.string().trim().max(150).optional(),
        website: z.string().trim().max(200).optional(),
        paymentQrId: id.optional(),
      })
      .parse(p);
    if (
      v.settings.paymentQrId &&
      !v.assets.some(
        (f) =>
          f.id === v.settings.paymentQrId &&
          f.kind === "paymentQR" &&
          f.targetId === "business",
      )
    )
      throw new Error("Select a valid payment QR image");
  } else if (action === "monthly") {
    const now = today();
    const month = now.slice(0, 7);
    for (const c of v.clients) {
      const pack = v.packages.find((t) => t.id === c.packageId);
      if (
        !c.active ||
        !pack ||
        pack.cycle !== "Monthly" ||
        Number(now.slice(8)) < c.billingDay
      )
        continue;
      if (v.documents.some((d) => d.recurringKey === c.id + ":" + month))
        continue;
      createDoc({
        kind: "invoice",
        clientId: c.id,
        date: now,
        due: now,
        month,
        workStart: month + "-01",
        workEnd: new Date(
          Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
        )
          .toISOString()
          .slice(0, 10),
        description: pack.name + "\n" + pack.description,
        subtotal: pack.price,
        discount: 0,
        tax: 0,
        terms: v.settings.terms,
        recurringKey: c.id + ":" + month,
      });
    }
  } else throw new Error("Unknown action");
  return v;
}


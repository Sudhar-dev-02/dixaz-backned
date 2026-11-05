import { z } from 'zod';
import { today } from './office.js';

export const blankOps = () => ({ attendance: [], corrections: [], messages: [], unassigned: [], audit: [] });
const text = z.string().trim().min(1).max(2000),
  date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => new Date(v).toISOString().slice(0, 10) === v),
  id = z.string().min(1).max(100);
const uid = () => crypto.randomUUID();

export function opsView(o, a) {
  if (a.role === 'super_admin' || a.role === 'hr') return o;
  if (a.role !== 'employee') return blankOps();
  return {
    attendance: o.attendance.filter(x => x.memberId === a.memberId),
    corrections: o.corrections.filter(x => x.memberId === a.memberId),
    messages: o.messages.filter(x => x.employeeId === a.memberId),
    unassigned: o.unassigned.filter(x => x.memberId === a.memberId),
    audit: o.audit.filter(x => x.memberId === a.memberId),
  };
}

export function attendanceTotals(r, at = Date.now()) {
  if (!r?.punches[0]) return { gross: 0, lunch: 0, net: 0 };
  const t = r.punches.map(v => new Date(v).getTime());
  const end = t[3] || Math.min(at, new Date(r.date + 'T23:59:59+05:30').getTime());
  const gross = Math.max(0, end - t[0]), lunch = t[1] ? Math.max(0, (t[2] || end) - t[1]) : 0;
  return { gross, lunch, net: Math.max(0, gross - lunch) };
}

export function unreadMessages(s, a) {
  return (s.operations?.messages || []).filter(m => (a.role === 'employee' ? m.employeeId === a.memberId && m.senderRole !== 'employee' : m.senderRole === 'employee') && !m.seen[a.memberId]).length;
}

export function appendMessage(s, a, employeeId, body, taskId = '') {
  s.operations ??= blankOps();
  s.operations.messages.push({
    id: uid(),
    employeeId,
    senderId: a.memberId,
    senderName: a.name,
    senderRole: a.role,
    text: body,
    taskId,
    at: new Date().toISOString(),
    seen: {},
  });
}

export function operationsAction(s, a, action, p) {
  if (!action.startsWith('ops:')) return null;
  const manager = a.role === 'super_admin' || a.role === 'hr', employee = a.role === 'employee';
  if (!manager && !employee) throw Error('Staff access required');
  const o = s.operations ??= blankOps(), stamp = new Date().toISOString();
  const needManager = () => { if (!manager) throw Error('HR or Super Admin required'); },
    needEmployee = () => { if (!employee) throw Error('Employee access required'); };
  const staff = (v) => {
    if (!s.members.some(m => m.id === v && m.role === 'employee' && m.active)) throw Error('Active employee required');
    return v;
  };
  const audit = (memberId, body) => o.audit.push({ id: uid(), at: stamp, actor: a.name, text: body, memberId });
  const workEntry = (kind) => {
    const x = z.object({
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
      note: text,
      url: z.string().url().max(2000).refine(v => /^https?:\/\//.test(v)),
    }).parse(p);
    const d = today(),
      start = new Date(d + 'T' + x.start + ':00+05:30').getTime(),
      end = new Date(d + 'T' + x.end + ':00+05:30').getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > Date.now()) throw Error('Use a valid completed time interval today');
    const intervals = [
      ...o.unassigned.filter(w => w.memberId === a.memberId).flatMap(w => w.entries.map(e => ({
        start: new Date(e.date + 'T' + e.start + ':00+05:30').getTime(),
        end: new Date(e.date + 'T' + e.end + ':00+05:30').getTime(),
      }))),
      ...s.updates.filter(u => u.memberId === a.memberId).flatMap(u => u.segments?.length ? u.segments.map(g => ({ start: Date.parse(g.start), end: Date.parse(g.end) })) : u.startAt && u.endAt ? [{ start: Date.parse(u.startAt), end: Date.parse(u.endAt) }] : []),
    ];
    if (intervals.some(e => start < e.end && end > e.start)) throw Error('This time overlaps recorded work');
    return { ...x, date: d, hours: (end - start) / 3600000, kind };
  };

  if (action === 'ops:punch') {
    needEmployee();
    const i = z.number().int().min(0).max(3).parse(p.step);
    let r = o.attendance.find(r => r.memberId === a.memberId && r.date === today());
    if (i !== (r?.punches.length || 0)) throw Error('Punch already recorded or out of order');
    if (!r) {
      r = { id: uid(), memberId: a.memberId, date: today(), punches: [] };
      o.attendance.push(r);
    }
    if (r.punches.length && stamp < r.punches.at(-1)) throw Error('Clock must move forward');
    r.punches.push(stamp);
    audit(a.memberId, ['Started work', 'Started lunch', 'Returned from lunch', 'Finished work'][i]);
  } else if (action === 'ops:correction') {
    needEmployee();
    const x = z.object({ date, reason: text }).parse(p);
    if (x.date > today()) throw Error('Cannot correct a future day');
    if (o.corrections.some(c => c.memberId === a.memberId && c.date === x.date && c.status === 'Pending')) throw Error('Request already pending');
    o.corrections.push({ ...x, id: uid(), memberId: a.memberId, status: 'Pending' });
    audit(a.memberId, 'Attendance correction requested · ' + x.date);
  } else if (action === 'ops:attendanceDecision') {
    needManager();
    const x = z.object({ id, approve: z.boolean(), note: text, times: z.array(z.string()).max(4) }).parse(p);
    const c = o.corrections.find(c => c.id === x.id && c.status === 'Pending');
    if (!c) throw Error('Pending request not found');
    if (c.memberId === a.memberId) throw Error('Cannot approve your own request');
    if (x.approve) {
      const raw = x.times;
      let gap = false;
      const punches = [];
      for (const t of raw) {
        if (!t) {
          gap = true;
          continue;
        }
        if (gap || !/^\d{2}:\d{2}$/.test(t)) throw Error('Enter punches in order');
        const ms = new Date(c.date + 'T' + t + ':00+05:30').getTime();
        if (!Number.isFinite(ms) || ms > Date.now() || (punches.length && ms <= Date.parse(punches.at(-1)))) throw Error('Times must be chronological and not in the future');
        punches.push(new Date(ms).toISOString());
      }
      if (!punches.length) throw Error('Check-in required');
      let r = o.attendance.find(r => r.memberId === c.memberId && r.date === c.date);
      const before = r?.punches.join(', ') || 'None';
      if (!r) {
        r = { id: uid(), memberId: c.memberId, date: c.date, punches: [] };
        o.attendance.push(r);
      }
      r.punches = punches;
      audit(c.memberId, 'Attendance correction ' + c.date + ' · Before: ' + before + ' · After: ' + punches.join(', ') + ' · ' + x.note);
    }
    c.status = x.approve ? 'Approved' : 'Rejected';
    c.note = x.note;
    audit(c.memberId, c.status + ' attendance request · ' + x.note);
    appendMessage(s, a, c.memberId, 'Attendance ' + c.date + ': ' + c.status + '. ' + x.note);
  } else if (action === 'ops:message') {
    const x = z.object({ employeeId: id, text, taskId: z.string().optional() }).parse(p);
    const target = employee ? a.memberId : staff(x.employeeId);
    if (employee && x.employeeId !== a.memberId) throw Error('Only your HR conversation is available');
    if (x.taskId && !s.tasks.some(t => t.id === x.taskId && t.assigneeId === target)) throw Error('Task does not belong to employee');
    appendMessage(s, a, target, x.text, x.taskId);
  } else if (action === 'ops:read') {
    const ids = z.array(id).max(1000).parse(p.ids);
    for (const m of o.messages) {
      if (ids.includes(m.id) && m.senderId !== a.memberId && (manager || m.employeeId === a.memberId)) {
        m.seen[a.memberId] ??= stamp;
      }
    }
  } else if (action === 'ops:unassigned') {
    needEmployee();
    const x = z.object({ serviceId: id, title: text, client: text }).parse(p);
    if (!s.services.some(v => v.id === x.serviceId && v.active)) throw Error('Select an active service');
    o.unassigned.push({ ...x, id: uid(), memberId: a.memberId, status: 'Pending', note: '', entries: [workEntry('Initial work')] });
    audit(a.memberId, 'Submitted unassigned work · ' + x.title);
  } else if (action === 'ops:resubmit') {
    needEmployee();
    const r = o.unassigned.find(r => r.id === p.id && r.memberId === a.memberId && r.status === 'Changes requested');
    if (!r) throw Error('Correction request not found');
    r.entries.push(workEntry('Correction'));
    r.status = 'Pending';
    audit(a.memberId, 'Resubmitted corrections · ' + r.title);
  } else if (action === 'ops:unassignedDecision') {
    needManager();
    const x = z.object({ id, decision: z.enum(['Approved', 'Changes requested', 'Rejected']), note: z.string().trim().max(2000) }).parse(p);
    const r = o.unassigned.find(r => r.id === x.id && r.status === 'Pending');
    if (!r) throw Error('Pending work not found');
    if (x.decision !== 'Approved' && !x.note) throw Error('Add a reason');
    r.status = x.decision;
    r.note = x.note;
    audit(r.memberId, x.decision + ' · ' + r.title + ' · ' + x.note);
    appendMessage(s, a, r.memberId, r.title + ': ' + x.decision + '. ' + x.note);
  } else {
    throw Error('Unknown operation');
  }
  return s;
}


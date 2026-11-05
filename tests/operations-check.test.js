import assert from 'node:assert/strict';
import { blank, today } from '../services/office.js';
import { applyAuthorized as A, filtered } from '../utils/access.js';
import { attendanceTotals } from '../services/operations.js';

const owner = { role: 'super_admin', memberId: 'owner', name: 'Owner', email: 'owner@example.test', clientId: '' };
let s = A(blank(), owner, 'member', { name: 'Editor', email: 'editor@example.test', role: 'employee', clientId: '', designation: 'Editor', active: true });
const e = { ...owner, role: 'employee', memberId: s.members[0].id };
const hr = { ...owner, role: 'hr', memberId: 'hr' };
const r = { id: 'day', memberId: e.memberId, date: '2026-10-30', punches: ['2026-10-30T09:00:00+05:30', '2026-10-30T13:00:00+05:30', '2026-10-30T14:00:00+05:30', '2026-10-30T18:00:00+05:30'] };

assert.equal(attendanceTotals(r).net, 8 * 3600000);
assert.equal(attendanceTotals(r).lunch, 3600000);
assert.throws(() => A(s, e, 'ops:punch', { step: 1 }));
s = A(s, e, 'ops:punch', { step: 0 });
assert.equal(s.operations.attendance[0].date, today());
assert.throws(() => A(s, e, 'ops:punch', { step: 0 }));
assert.throws(() => A(s, hr, 'ops:punch', { step: 0 }));
s = A(s, hr, 'ops:message', { employeeId: e.memberId, text: 'Please update the captions' });
const m = s.operations.messages.at(-1);
s = A(s, e, 'ops:read', { ids: [m.id] });
assert.ok(s.operations.messages.at(-1).seen[e.memberId]);
assert.throws(() => A(s, e, 'ops:message', { employeeId: 'other', text: 'No' }));
assert.equal(filtered(s, { ...e, memberId: 'other' }).operations.messages.length, 0);
s = A(s, e, 'ops:correction', { date: '2026-10-30', reason: 'Missed checkout' });
const request = s.operations.corrections[0].id;
assert.throws(() => A(s, e, 'ops:attendanceDecision', { id: request, approve: true, note: 'test', times: ['09:00', '13:00', '14:00', '18:00'] }));
s = A(s, hr, 'ops:attendanceDecision', { id: request, approve: true, note: 'Verified', times: ['09:00', '13:00', '14:00', '18:00'] });
assert.equal(s.operations.corrections[0].status, 'Approved');
assert.equal(attendanceTotals(s.operations.attendance.find(x => x.date === '2026-10-30')).net, 8 * 3600000);
assert.ok(s.operations.audit.some(x => x.text.includes('Before:')));
assert.ok(filtered(s, e).services.every(x => x.price === null));
console.log('PASS attendance totals/order, manager approval, private messages, seen and financial filtering');


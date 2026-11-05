import assert from 'node:assert/strict';
import { blank } from '../services/office.js';
import { applyAuthorized as A, filtered } from '../utils/access.js';

const admin = { role: 'super_admin', memberId: 'owner', name: 'Owner', email: 'owner@example.test', clientId: '' };
const hr = { ...admin, role: 'hr', memberId: 'hr' };
let s = A(blank(), admin, 'client', { name: 'Test client', email: 'test@example.test', contact: '', phone: '9000000000', address: 'Address', gst: '', packageId: '', billingDay: 1, active: true, notes: '' });
const input = { kind: 'invoice', clientId: s.clients[0].id, date: '2026-11-01', due: '2026-11-10', workStart: '2026-11-01', workEnd: '2026-11-03', month: '2026-11', items: [{ code: 'A', description: 'Poster', quantity: 10, rate: 350 }, { code: 'B', description: 'Video', quantity: 2, rate: 750 }], discount: 0, tax: 0, terms: 'Original terms' };
s = A(s, admin, 'document', input); const original = structuredClone(s.documents[0]); const seq = s.seq;
s = A(s, hr, 'document', { ...input, id: original.id, items: [{ code: 'A', description: 'Revised poster', quantity: 5, rate: 300 }], terms: 'Updated terms', discount: 100 });
assert.equal(s.documents.length, 1); assert.equal(s.seq, seq); assert.equal(s.documents[0].number, original.number); assert.equal(s.documents[0].id, original.id); assert.equal(s.documents[0].total, 1400); assert.equal(s.documents[0].items?.length, 1); assert.equal(s.documents[0].terms, 'Updated terms'); assert.deepEqual(s.documents[0].business, original.business);
assert.equal(filtered(s, { ...admin, role: 'client', clientId: input.clientId }).documents.length, 0);
assert.throws(() => A(s, { ...admin, role: 'employee' }, 'document', { ...input, id: original.id }));
assert.throws(() => A(s, hr, 'document', { ...input, id: 'missing' }));
s = A(s, hr, 'publish', { id: original.id }); assert.throws(() => A(s, hr, 'document', { ...input, id: original.id }));
console.log('PASS draft edit retains number, replaces items, recalculates totals, hides draft and protects published documents');


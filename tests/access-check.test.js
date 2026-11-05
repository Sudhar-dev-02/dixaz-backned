import assert from 'node:assert/strict';
import { blank, today } from '../services/office.js';
import { servicePrice } from '../utils/catalogue.js';
import { validateUpload } from '../utils/files.js';
import { applyAuthorized as A, filtered as F, actorFor, normalize, canReadAsset, canUploadAsset } from '../utils/access.js';

const admin = { role: 'super_admin', memberId: 'owner', name: 'Owner', email: 'owner@example.com', clientId: '' };
let s = blank();

for (const [name, email] of [['Client A', 'a@example.com'], ['Client B', 'b@example.com']])
  s = A(s, admin, 'client', { name, email, contact: '', phone: '+919876543210', address: '', gst: '', packageId: '', billingDay: 1, active: true, notes: 'PRIVATE CLIENT NOTE' });

for (const [name, email, role, clientId] of [['Employee A', 'e1@example.com', 'employee', ''], ['Employee B', 'e2@example.com', 'employee', ''], ['HR', 'hr@example.com', 'hr', ''], ['Client A', 'a@example.com', 'client', s.clients[0].id]])
  s = A(s, admin, 'member', { name, email, role, clientId, designation: '', active: true });

const employee = { role: 'employee', memberId: s.members[0].id, name: 'Employee A', email: s.members[0].email, clientId: '' };
const hr = { role: 'hr', memberId: s.members[2].id, name: 'HR', email: 'hr@example.com', clientId: '' };
const client = { role: 'client', memberId: s.members[3].id, name: 'Client A', email: 'a@example.com', clientId: s.clients[0].id };

for (let i = 0; i < 2; i++) {
  s = A(s, admin, 'project', { name: 'Project ' + i, clientId: s.clients[i].id, description: 'Public project', due: today(), visible: true });
  s = A(s, admin, 'task', { projectId: s.projects[i].id, title: 'Task ' + i, description: 'PRIVATE INSTRUCTIONS', assigneeId: s.members[i].id, due: today(), priority: 'Normal', visible: true, publicSummary: 'Public note' });
  s = A(s, admin, 'document', { kind: 'invoice', clientId: s.clients[i].id, date: today(), due: today(), month: '', description: 'Service', subtotal: 1000, discount: 0, tax: 0, terms: '' });
}

s = A(s, admin, 'publish', { id: s.documents[0].id });
assert.throws(() => A(s, employee, 'dailyUpdate', { taskId: s.tasks[1].id, date: today(), summary: 'IDOR attempt', blocker: '', hours: 1, status: 'In progress', progress: 10 }));
s = A(s, employee, 'dailyUpdate', { taskId: s.tasks[0].id, date: today(), summary: 'PRIVATE DAILY NOTE', blocker: 'INTERNAL BLOCKER', hours: 2, status: 'In progress', progress: 40 });
assert.equal(F(s, employee).tasks.length, 1); assert.equal(F(s, employee).documents.length, 0); assert.equal(F(s, employee).clients.length, 0); assert.equal(F(s, hr).documents.length, 2); assert.equal(F(s, hr).packages.length, 0);

const cv = F(s, client);
assert.equal(cv.projects.length, 1); assert.equal(cv.tasks.length, 1); assert.equal(cv.documents.length, 1); assert.equal(cv.documents[0].client.notes, ''); assert.equal(cv.updates.length, 0); assert.equal(cv.tasks[0].description, ''); assert.equal(cv.members.length, 0); assert.equal(cv.tasks[0].progress, 40);

for (const role of [employee, client]) { for (const action of ['payment', 'document', 'settings', 'publish', 'client', 'monthly']) assert.throws(() => A(s, role, action, {})); }
assert.throws(() => A(s, hr, 'member', { name: 'Promoted', email: 'bad@example.com', role: 'hr', clientId: '', designation: '', active: true }));
assert.throws(() => A(s, hr, 'member', { ...s.members[3], name: 'Changed client' })); assert.throws(() => A(s, employee, 'task', { ...s.tasks[0] }));

const pinned = structuredClone(s); pinned.members[0].userId = 'real-user'; assert.equal(actorFor(pinned, { userId: 'imposter', email: 'e1@example.com', displayName: 'X' }, 'owner-id'), null); assert.equal(actorFor(pinned, { userId: 'real-user', email: 'changed@example.com', displayName: 'X' }, 'owner-id').role, 'employee'); pinned.members[0].active = false; assert.equal(actorFor(pinned, { userId: 'real-user', email: 'e1@example.com', displayName: 'X' }, 'owner-id'), null);
assert.throws(() => A(s, employee, 'dailyUpdate', { taskId: s.tasks[0].id, date: today(), summary: 'Hours', blocker: '', hours: 23, status: 'In progress', progress: 50 }));
assert.throws(() => A(s, employee, 'dailyUpdate', { taskId: s.tasks[0].id, date: today(), summary: 'Mismatch', blocker: '', hours: 1, status: 'Completed', progress: 20 }));
assert.equal(F(s, admin).documents.length, 2); assert.equal(F(s, admin).updates.length, 1);

assert.equal(s.clients[0].regNo, 'DX-CL-00001'); assert.equal(s.clients[1].regNo, 'DX-CL-00002');
const reg = s.clients[0].regNo; s = A(s, admin, 'client', { ...s.clients[0], regNo: 'HACK', name: 'Updated client' }); assert.equal(s.clients[0].regNo, reg);
let old = structuredClone(s); delete old.clientSeq; old.clients.forEach(c => delete c.regNo); const migrated = normalize(old); assert.equal(new Set(migrated.clients.map(c => c.regNo)).size, 2); assert.deepEqual(normalize(migrated).clients, migrated.clients);

const profile = { id: employee.memberId, name: 'Employee A', phone: '1234567890', address: 'PRIVATE HOME', designation: 'Designer', joiningDate: '2026-01-01', employmentType: 'Freelancer', bio: 'Portfolio' };
s = A(s, admin, 'profile', profile);
s = A(s, employee, 'profile', { ...profile, role: 'super_admin', active: false, userId: 'attacker' }); assert.equal(s.members[0].role, 'employee'); assert.equal(s.members[0].address, 'PRIVATE HOME'); assert.equal(s.members[0].active, true);
assert.throws(() => A(s, employee, 'profile', { ...profile, id: s.members[1].id })); assert.throws(() => A(s, client, 'profile', profile)); assert.equal(F(s, client).members.length, 0);
s = A(s, admin, 'member', { ...s.members[0], designation: 'Senior Designer' }); assert.equal(s.members[0].address, 'PRIVATE HOME');

const asset = { id: 'asset', kind: 'resume', targetId: employee.memberId, name: 'resume.pdf', mime: 'application/pdf', size: 8, version: 1, current: true, uploadedAt: new Date().toISOString(), uploadedBy: 'A' };
s.assets.push(asset); assert.equal(canReadAsset(s, client, asset), false); assert.equal(canReadAsset(s, employee, asset), true); assert.equal(canReadAsset(s, { ...employee, memberId: s.members[1].id }, asset), false); assert.equal(canReadAsset(s, hr, asset), true);
assert.equal(canUploadAsset(s, employee, 'certificate', employee.memberId), false); assert.equal(canUploadAsset(s, hr, 'certificate', employee.memberId), true); assert.equal(canUploadAsset(s, client, 'clientLogo', s.clients[1].id), false); assert.equal(canUploadAsset(s, client, 'clientLogo', client.clientId), true);
assert.equal(F(s, client).assets.length, 0); assert.equal(F(s, employee).assets.length, 1);

assert.equal(validateUpload('resume', 'resume.pdf', new TextEncoder().encode('%PDF-1.4')), 'application/pdf'); assert.throws(() => validateUpload('resume', 'bad.pdf', new TextEncoder().encode('<script>alert(1)</script>'))); assert.throws(() => validateUpload('profilePhoto', 'file.svg', new TextEncoder().encode('<svg>bad</svg>'))); assert.throws(() => validateUpload('profilePhoto', 'large.png', new Uint8Array(4 * 1024 * 1024)));

assert.equal(s.services.length, 13); const svc = s.services[0]; s = A(s, admin, 'service', { ...svc, price: 10000, offerPrice: 8000, offerName: 'Festival', offerStart: '2026-10-01', offerEnd: '2026-10-31' });
assert.equal(servicePrice(s.services[0], '2026-10-13'), 8000); assert.equal(servicePrice(s.services[0], '2026-11-01'), 10000); assert.equal(s.services[0].history.length, 1);

const priorTotal = s.documents[0].total; s = A(s, admin, 'service', { ...s.services[0], price: 12000 }); assert.equal(s.documents[0].total, priorTotal); assert.equal(s.services[0].history.length, 2); assert.equal(A(s, hr, 'service', { ...svc, price: 1 }).services[0].price, 1); assert.throws(() => A(s, admin, 'service', { ...svc, price: 100, offerPrice: 200, offerStart: '2026-10-01', offerEnd: '2026-10-31' })); assert.equal(F(s, employee).services.length, 13); assert(F(s, employee).services.every(s => s.price === null && s.offerPrice === null && s.history.length === 0));

const invoiceInput = { kind: 'invoice', clientId: s.clients[0].id, date: today(), due: today(), month: '', description: '', subtotal: 1, discount: 0, tax: 0, terms: '', items: [{ code: '1001', description: 'Full video', quantity: 30, rate: 750, amount: 1 }, { code: '1002', description: 'Post', quantity: 10, rate: 350, amount: 1 }] };
const billed = A(s, hr, 'document', invoiceInput); const bill = billed.documents.at(-1); assert.equal(bill.total, 26000); assert.equal(bill.items[0].amount, 22500); assert.equal(bill.items[1].amount, 3500); assert.equal(bill.subtotal, 26000);

assert.throws(() => A(s, employee, 'document', invoiceInput)); assert.throws(() => A(s, client, 'document', invoiceInput)); assert.throws(() => A(s, hr, 'settings', s.settings)); assert.throws(() => A(s, hr, 'client', s.clients[0]));
assert.throws(() => A(s, hr, 'document', { ...invoiceInput, items: [{ code: '', description: 'Bad', quantity: -1, rate: 100 }] }));

const employeeRequest = { action: 'member', payload: { name: 'New Employee', email: 'new@example.com', role: 'employee', clientId: '', designation: 'Editor', active: true }, reason: 'New editor joining' };
let requested = A(s, hr, 'requestChange', employeeRequest); assert.equal(requested.members.length, s.members.length); assert.equal(requested.requests[0].status, 'Pending'); assert.equal(F(requested, employee).requests.length, 0); assert.equal(F(requested, client).requests.length, 0);
assert.throws(() => A(requested, hr, 'requestDecision', { id: requested.requests[0].id, approve: true, note: '' }));
requested = A(requested, admin, 'requestDecision', { id: requested.requests[0].id, approve: true, note: 'Approved' }); assert.equal(requested.members.length, s.members.length + 1); assert.equal(requested.requests[0].status, 'Approved'); assert.throws(() => A(requested, admin, 'requestDecision', { id: requested.requests[0].id, approve: true, note: '' }));

let removal = A(s, hr, 'requestChange', { action: 'removeClient', payload: { id: s.clients[0].id }, reason: 'Client contract ended' }); assert.equal(removal.clients[0].active, true); removal = A(removal, admin, 'requestDecision', { id: removal.requests[0].id, approve: true, note: '' }); assert.equal(removal.clients[0].active, false); assert.equal(removal.members[3].active, false); assert.equal(removal.documents.length, s.documents.length);

let stale = A(s, hr, 'requestChange', { action: 'removeMember', payload: { id: s.members[0].id }, reason: 'Leaving' }); stale = A(stale, admin, 'profile', { ...profile, name: 'Updated name' }); assert.throws(() => A(stale, admin, 'requestDecision', { id: stale.requests[0].id, approve: true, note: '' })); stale = A(stale, admin, 'requestDecision', { id: stale.requests[0].id, approve: false, note: 'Please resubmit' }); assert.equal(stale.requests[0].status, 'Rejected');

assert.throws(() => A(s, admin, 'member', { ...employeeRequest.payload, role: 'super_admin' })); assert.throws(() => A(s, hr, 'requestChange', { ...employeeRequest, payload: { ...employeeRequest.payload, role: 'hr' } }));

const duplicate = A(s, admin, 'service', { ...svc, id: undefined, code: '1001', name: 'Full video', price: 750 }); const repeat = A(duplicate, hr, 'service', { ...svc, id: undefined, code: '1004', name: 'Full video', price: 750 }); assert.equal(repeat.services.filter(x => x.name === 'Full video').length, 2); assert.equal(A(duplicate, hr, 'service', { ...svc, id: undefined, code: '1001', name: 'Other', price: 300 }).services.at(-1).code, '2015');

const qr = { id: 'qr-v1', kind: 'paymentQR', targetId: 'business', name: 'pay.png', mime: 'image/png', size: 12, version: 1, current: true, uploadedAt: new Date().toISOString(), uploadedBy: 'Owner' };
let bank = structuredClone(s); bank.assets.push(qr); bank = A(bank, admin, 'settings', { ...bank.settings, accountName: 'Test Account', bankName: 'Test Bank', accountNumber: '00123456', ifsc: 'TEST0000001', upi: 'test@upi', website: 'dixaz.in', paymentQrId: qr.id });
bank = A(bank, admin, 'document', invoiceInput); const bankDoc = bank.documents.at(-1); assert.equal(bankDoc.business.accountNumber, '00123456'); assert.equal(bankDoc.business.paymentQrId, 'qr-v1'); assert.equal(bankDoc.client.address, bank.clients[0].address);

assert.equal(canUploadAsset(bank, admin, 'paymentQR', 'business'), true); assert.equal(canUploadAsset(bank, hr, 'paymentQR', 'business'), false); assert.equal(canUploadAsset(bank, client, 'paymentQR', 'business'), false); assert.equal(canReadAsset(bank, client, qr), false); assert.equal(canReadAsset(bank, employee, qr), false); assert.equal(canReadAsset(bank, hr, qr), true);

bank = A(bank, admin, 'publish', { id: bankDoc.id }); assert.equal(canReadAsset(bank, client, qr), true); assert.equal(canReadAsset(bank, { ...client, clientId: bank.clients[1].id }, qr), false);
bank.assets.push({ ...qr, id: 'qr-v2', version: 2 }); bank = A(bank, admin, 'settings', { ...bank.settings, accountNumber: '00987654', paymentQrId: 'qr-v2' }); assert.equal(bank.documents.at(-1).business.accountNumber, '00123456'); assert.equal(bank.documents.at(-1).business.paymentQrId, 'qr-v1'); assert.equal(canReadAsset(bank, client, bank.assets.at(-1)), false);
bank = A(bank, admin, 'client', { ...bank.clients[0], address: 'NEW ADDRESS' }); assert.equal(bank.documents.at(-1).client.address, bankDoc.client.address); assert.throws(() => A(bank, admin, 'settings', { ...bank.settings, paymentQrId: 'unknown' })); assert.throws(() => A(bank, hr, 'settings', bank.settings)); assert.equal(validateUpload('paymentQR', 'qr.png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');

let onboard = A(s, admin, 'client', { ...s.clients[0], onboardingDate: '2026-10-14', whatsapp: '+919000000001', serviceIds: [s.services[0].id, s.services[1].id] }); const onboardClient = F(onboard, client); assert.equal(onboardClient.clients[0].whatsapp, '+919000000001'); assert.equal(onboardClient.services.length, 2); assert.equal(onboardClient.services[0].price, null); assert.equal(F(onboard, employee).clients.length, 0); assert.equal(F(onboard, employee).services.length, 13); assert(F(onboard, employee).services.every(s => s.price === null)); assert.equal(F(onboard, hr).clients[0].onboardingDate, '2026-10-14'); assert.throws(() => A(s, admin, 'client', { ...s.clients[0], serviceIds: ['not-a-service'] }));

let multi = A(s, admin, 'document', { ...invoiceInput, month: '2026-10', workStart: '2026-10-01', workEnd: '2026-10-10' }); multi = A(multi, hr, 'document', { ...invoiceInput, month: '2026-10', workStart: '2026-10-11', workEnd: '2026-10-20' }); assert.notEqual(multi.documents.at(-1).number, multi.documents.at(-2).number); assert.equal(multi.documents.at(-1).workStart, '2026-10-11'); assert.throws(() => A(s, admin, 'document', { ...invoiceInput, workStart: '2026-10-20', workEnd: '2026-10-10' }));

let monthly = A(s, admin, 'package', { name: 'Monthly plan', description: 'Monthly deliverables', price: 1000, cycle: 'Monthly' }); monthly = A(monthly, admin, 'client', { ...monthly.clients[0], packageId: monthly.packages.at(-1).id, billingDay: 1 }); monthly = A(monthly, admin, 'document', { ...invoiceInput, month: today().slice(0, 7) }); monthly = A(monthly, admin, 'monthly', {}); const monthlyCount = monthly.documents.length; monthly = A(monthly, hr, 'monthly', {}); assert.equal(monthly.documents.length, monthlyCount); assert.equal(monthly.documents.filter(d => d.recurringKey === s.clients[0].id + ':' + today().slice(0, 7)).length, 1);

let coded = A(s, hr, 'service', { ...svc, id: undefined, code: '9999', name: 'New service', price: 300 }); assert.equal(coded.services.at(-1).code, '2014'); coded = A(coded, admin, 'service', { ...coded.services.at(-1), code: '5555', name: 'Updated service' }); assert.equal(coded.services.at(-1).code, '2014'); coded = A(coded, hr, 'service', { ...svc, id: undefined, name: 'Another', price: 500 }); assert.equal(coded.services.at(-1).code, '2015');

let work = A(s, hr, 'project', { clientId: s.clients[0].id, name: 'Poster delivery', description: 'Client-visible scope', due: today(), visible: true }); work = A(work, hr, 'task', { projectId: work.projects.at(-1).id, title: 'Poster content', description: 'Prepare the Tamil copy', assigneeId: employee.memberId, due: today(), priority: 'Normal', visible: true, publicSummary: 'Content preparation', referenceUrl: 'https://example.com/reference' }); const workId = work.tasks.at(-1).id; assert.equal(work.tasks.at(-1).status, 'Pending');

work = A(work, employee, 'dailyUpdate', { taskId: workId, date: today(), summary: 'Copy ready', blocker: '', hours: 1, status: 'Completed', progress: 100 }); work = A(work, hr, 'task', { ...work.tasks.at(-1), correction: 'At 00:15 change the text', reopen: true }); assert.equal(work.tasks.at(-1).status, 'In progress'); assert.ok(work.tasks.at(-1).progress < 100); assert.equal(work.tasks.at(-1).history.length, 3); assert.match(F(work, employee).tasks.find(t => t.id === workId).history.at(-1).note, /00:15/); const clientTask = F(work, client).tasks.find(t => t.id === workId); assert.equal(clientTask.history.length, 0); assert.equal(clientTask.referenceUrl, ''); assert.equal(F(work, employee).documents.length, 0); assert.equal(F(work, employee).packages.length, 0); assert.equal(F(work, { ...employee, memberId: s.members[1].id }).tasks.some(t => t.id === workId), false); assert.throws(() => A(work, employee, 'taskReview', { id: workId, status: 'Completed', progress: 100 })); assert.throws(() => A(work, hr, 'task', { ...work.tasks.at(-1), referenceUrl: 'javascript:alert(1)' }));

const legacy = structuredClone(s); legacy.tasks[0].status = 'To do'; delete legacy.tasks[0].history; assert.equal(normalize(legacy).tasks[0].status, 'Pending'); assert.equal(normalize(legacy).tasks[0].history.length, 0);

console.log('PASS: onboarding and multiple services, employee financial isolation, automatic immutable service codes, same-month unique invoices, work-date validation, recurring invoice deduplication, HR assignment, employee updates and private correction history.');
console.log('PASS: owner banking controls, bank/QR snapshots, saved client-address snapshots, QR validation, published-document QR access and cross-client isolation.');
console.log('PASS: quantity billing totals, tampered subtotal ignored, HR invoicing, owner-only approvals, no changes before approval, rejection/replay/stale protection, safe deactivation and unique service codes.');
console.log('PASS: unique registration/backfill stability, profile self-edit and privilege protection, private file scope, certificate authority, upload validation, 13 services, offer date boundaries, price history and invoice snapshot preservation.');
console.log('PASS: role filtering, client separation, draft privacy, internal-note redaction, assigned-task enforcement, financial-action denial, HR privilege restrictions, pinned identities, deactivation, daily-hour limit and progress validation.');


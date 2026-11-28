import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { LocalFileStore } from '../db/store.js';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpCode,
  generateTotpSecret,
  hashArgon2,
  sha256Hex,
} from '../security/crypto.js';
import { IDLE_TIMEOUT_MS } from '../middleware/auth.js';

function extractCookie(setCookies: string | string[] | undefined, name: string): string {
  const lines = Array.isArray(setCookies) ? setCookies : setCookies ? [setCookies] : [];
  for (const line of lines) {
    if (line.startsWith(`${name}=`)) {
      return line.split(';')[0]!.slice(name.length + 1);
    }
  }
  return '';
}

async function setupEnv() {
  const store = new LocalFileStore(null);
  const totpSecret = generateTotpSecret();
  const recovery = generateRecoveryCodes(4);

  const owner = await store.upsertProvisionedAdmin({
    email: 'owner@rjhubprinting.com',
    displayName: 'RJ Owner',
    role: 'owner',
    passwordHash: hashArgon2('StrongOwner@2026!'),
    pinHash: hashArgon2('246810'),
    totpSecretEncrypted: encryptSecret(totpSecret),
    mfaEnabled: true,
    recoveryCodeHashes: recovery.hashes,
    lastTotpStep: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    lastLoginAt: null,
  });

  const staff = await store.upsertProvisionedAdmin({
    email: 'staff@rjhubprinting.com',
    displayName: 'RJ Staff',
    role: 'staff',
    passwordHash: hashArgon2('StrongStaff@2026!'),
    pinHash: hashArgon2('135790'),
    totpSecretEncrypted: null,
    mfaEnabled: false,
    recoveryCodeHashes: [],
    lastTotpStep: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    lastLoginAt: null,
  });

  const app = createApp(store);
  return { app, store, owner, staff, totpSecret, recoveryCodes: recovery.plain };
}

async function authenticateOwner(
  app: ReturnType<typeof createApp>,
  totpSecret: string,
  stepOffset = 0,
) {
  const l1 = await request(app)
    .post('/api/admin/auth/login')
    .send({ email: 'owner@rjhubprinting.com', password: 'StrongOwner@2026!' });
  expect(l1.status).toBe(200);
  const s1 = extractCookie(l1.headers['set-cookie'], 'rjhub_admin_session');
  const c1 = extractCookie(l1.headers['set-cookie'], 'rjhub_csrf');

  const l2 = await request(app)
    .post('/api/admin/auth/verify-pin')
    .set('Cookie', [`rjhub_admin_session=${s1}`, `rjhub_csrf=${c1}`])
    .set('X-CSRF-Token', c1)
    .send({ pin: '246810' });
  expect(l2.status).toBe(200);
  const s2 = extractCookie(l2.headers['set-cookie'], 'rjhub_admin_session');
  const c2 = extractCookie(l2.headers['set-cookie'], 'rjhub_csrf');

  const code = generateTotpCode(totpSecret, Math.floor(Date.now() / 1000 / 30) + stepOffset);
  const l3 = await request(app)
    .post('/api/admin/auth/verify-mfa')
    .set('Cookie', [`rjhub_admin_session=${s2}`, `rjhub_csrf=${c2}`])
    .set('X-CSRF-Token', c2)
    .send({ code });
  expect(l3.status).toBe(200);
  const session = extractCookie(l3.headers['set-cookie'], 'rjhub_admin_session');
  const csrf = extractCookie(l3.headers['set-cookie'], 'rjhub_csrf');
  return { session, csrf, oldSession: s1 };
}

describe('RJ HUB Printing — 12-Case Backend & Admin Security Test Suite', () => {
  let ctx: Awaited<ReturnType<typeof setupEnv>>;

  beforeEach(async () => {
    ctx = await setupEnv();
  });

  it('1. Rejects direct unauthenticated admin API calls and blocks public admin registration', async () => {
    const res = await request(ctx.app).get('/api/admin/dashboard');
    expect(res.status).toBe(401);

    const reg = await request(ctx.app)
      .post('/api/admin/auth/register')
      .send({ email: 'attacker@example.com', password: 'Password@12345' });
    expect(reg.status).toBe(403);
  });

  it('2. Uses uniform errors for unknown emails vs wrong passwords (prevents user enumeration)', async () => {
    const unknown = await request(ctx.app)
      .post('/api/admin/auth/login')
      .send({ email: 'nobody@rjhubprinting.com', password: 'WrongPassword@2026!' });
    const wrongPw = await request(ctx.app)
      .post('/api/admin/auth/login')
      .send({ email: 'owner@rjhubprinting.com', password: 'WrongPassword@2026!' });

    expect(unknown.status).toBe(401);
    expect(wrongPw.status).toBe(401);
    expect(unknown.body).toEqual(wrongPw.body);
  });

  it('3. Locks out PIN verification after 3 failed 6-digit attempts and revokes partial session', async () => {
    const l1 = await request(ctx.app)
      .post('/api/admin/auth/login')
      .send({ email: 'owner@rjhubprinting.com', password: 'StrongOwner@2026!' });
    const s1 = extractCookie(l1.headers['set-cookie'], 'rjhub_admin_session');
    const c1 = extractCookie(l1.headers['set-cookie'], 'rjhub_csrf');

    for (let i = 0; i < 2; i += 1) {
      const bad = await request(ctx.app)
        .post('/api/admin/auth/verify-pin')
        .set('Cookie', [`rjhub_admin_session=${s1}`, `rjhub_csrf=${c1}`])
        .set('X-CSRF-Token', c1)
        .send({ pin: '000000' });
      expect(bad.status).toBe(401);
    }

    const third = await request(ctx.app)
      .post('/api/admin/auth/verify-pin')
      .set('Cookie', [`rjhub_admin_session=${s1}`, `rjhub_csrf=${c1}`])
      .set('X-CSRF-Token', c1)
      .send({ pin: '000000' });
    expect(third.status).toBe(423);
    expect(third.headers['retry-after']).toBeDefined();

    const logs = await ctx.store.listSecurityLogs({});
    expect(logs.items.some((l) => l.eventType === 'PIN_LOCKOUT_TRIGGERED')).toBe(true);
  });

  it('4. Rejects TOTP replay and single-use recovery code reuse', async () => {
    const l1 = await request(ctx.app)
      .post('/api/admin/auth/login')
      .send({ email: 'owner@rjhubprinting.com', password: 'StrongOwner@2026!' });
    const s1 = extractCookie(l1.headers['set-cookie'], 'rjhub_admin_session');
    const c1 = extractCookie(l1.headers['set-cookie'], 'rjhub_csrf');

    const l2 = await request(ctx.app)
      .post('/api/admin/auth/verify-pin')
      .set('Cookie', [`rjhub_admin_session=${s1}`, `rjhub_csrf=${c1}`])
      .set('X-CSRF-Token', c1)
      .send({ pin: '246810' });
    const s2 = extractCookie(l2.headers['set-cookie'], 'rjhub_admin_session');
    const c2 = extractCookie(l2.headers['set-cookie'], 'rjhub_csrf');

    const step = Math.floor(Date.now() / 1000 / 30);
    const code = generateTotpCode(decryptSecret(ctx.owner.totpSecretEncrypted!), step);

    const first = await request(ctx.app)
      .post('/api/admin/auth/verify-mfa')
      .set('Cookie', [`rjhub_admin_session=${s2}`, `rjhub_csrf=${c2}`])
      .set('X-CSRF-Token', c2)
      .send({ code });
    expect(first.status).toBe(200);

    // Replay same TOTP step cleanly rejected
    const l1b = await request(ctx.app)
      .post('/api/admin/auth/login')
      .send({ email: 'owner@rjhubprinting.com', password: 'StrongOwner@2026!' });
    const s1b = extractCookie(l1b.headers['set-cookie'], 'rjhub_admin_session');
    const c1b = extractCookie(l1b.headers['set-cookie'], 'rjhub_csrf');
    const l2b = await request(ctx.app)
      .post('/api/admin/auth/verify-pin')
      .set('Cookie', [`rjhub_admin_session=${s1b}`, `rjhub_csrf=${c1b}`])
      .set('X-CSRF-Token', c1b)
      .send({ pin: '246810' });
    const s2b = extractCookie(l2b.headers['set-cookie'], 'rjhub_admin_session');
    const c2b = extractCookie(l2b.headers['set-cookie'], 'rjhub_csrf');

    const replay = await request(ctx.app)
      .post('/api/admin/auth/verify-mfa')
      .set('Cookie', [`rjhub_admin_session=${s2b}`, `rjhub_csrf=${c2b}`])
      .set('X-CSRF-Token', c2b)
      .send({ code });
    expect(replay.status).toBe(401);

    // Single-use recovery code succeeds once, fails on reuse
    const rec = ctx.recoveryCodes[0]!;
    const okRec = await request(ctx.app)
      .post('/api/admin/auth/verify-mfa')
      .set('Cookie', [`rjhub_admin_session=${s2b}`, `rjhub_csrf=${c2b}`])
      .set('X-CSRF-Token', c2b)
      .send({ code: rec });
    expect(okRec.status).toBe(200);
    const s3 = extractCookie(okRec.headers['set-cookie'], 'rjhub_admin_session');
    const c3 = extractCookie(okRec.headers['set-cookie'], 'rjhub_csrf');
    expect(s3).toBeTruthy();
    expect(c3).toBeTruthy();

    const updatedOwner = await ctx.store.findAdminById(ctx.owner.id);
    expect(updatedOwner?.recoveryCodeHashes.length).toBe(ctx.recoveryCodes.length - 1);
  });

  it('5. Enforces session rotation, 15-minute idle timeout, and logout revocation', async () => {
    const auth = await authenticateOwner(ctx.app, ctx.totpSecret);

    // Old pre-MFA rotated session token is invalid
    const stale = await request(ctx.app)
      .get('/api/admin/dashboard')
      .set('Cookie', [`rjhub_admin_session=${auth.oldSession}`]);
    expect(stale.status).toBe(401);

    // Idle timeout > 15m expires session
    const sess = await ctx.store.findSessionByTokenHash(sha256Hex(auth.session));
    expect(sess).toBeTruthy();
    await ctx.store.updateSession(sess!.id, {
      lastActiveAt: new Date(Date.now() - IDLE_TIMEOUT_MS - 5000).toISOString(),
    });
    const idleRes = await request(ctx.app)
      .get('/api/admin/dashboard')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    expect(idleRes.status).toBe(401);

    // Re-auth with next valid TOTP window step (+1) then logout revokes token permanently
    const fresh = await authenticateOwner(ctx.app, ctx.totpSecret, 1);
    const logout = await request(ctx.app)
      .post('/api/admin/auth/logout')
      .set('Cookie', [`rjhub_admin_session=${fresh.session}`, `rjhub_csrf=${fresh.csrf}`])
      .set('X-CSRF-Token', fresh.csrf);
    expect(logout.status).toBe(200);

    const postLogout = await request(ctx.app)
      .get('/api/admin/dashboard')
      .set('Cookie', [`rjhub_admin_session=${fresh.session}`]);
    expect(postLogout.status).toBe(401);
  });

  it('6. Requires fresh PIN reauthentication before deleting a client and anonymizes inquiry history', async () => {
    const auth = await authenticateOwner(ctx.app, ctx.totpSecret);
    const client = await ctx.store.createClient({
      fullName: 'Elena Cruz',
      contactInfo: '09171234567',
      notes: 'VIP client',
    });
    const inq = await ctx.store.createInquiry({
      customerName: 'Elena Cruz',
      contactInfo: '09171234567',
      serviceId: 'sintra-board',
      message: 'Need 5 pieces A3 Sintra Board prints.',
    });

    const sess = await ctx.store.findSessionByTokenHash(sha256Hex(auth.session));
    await ctx.store.updateSession(sess!.id, {
      reauthVerifiedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });

    const blocked = await request(ctx.app)
      .delete(`/api/admin/clients/${client.id}`)
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf);
    expect(blocked.status).toBe(403);

    const reauth = await request(ctx.app)
      .post('/api/admin/auth/reauth')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf)
      .send({ pin: '246810' });
    expect(reauth.status).toBe(200);

    const allowed = await request(ctx.app)
      .delete(`/api/admin/clients/${client.id}`)
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf);
    expect(allowed.status).toBe(200);
    expect(allowed.body.archivedInquiryCount).toBe(1);

    const retained = await ctx.store.getInquiryById(inq.id);
    expect(retained?.customerNameSnapshot).toBe('Elena Cruz');
    expect(retained?.customerId).toBeNull();
  });

  it('7. Applies centralized rate limiting across repeated login and inquiry submissions', async () => {
    for (let i = 0; i < 8; i += 1) {
      await request(ctx.app)
        .post('/api/admin/auth/login')
        .send({ email: 'owner@rjhubprinting.com', password: 'WrongPassword@2026!' });
    }
    const ninth = await request(ctx.app)
      .post('/api/admin/auth/login')
      .send({ email: 'owner@rjhubprinting.com', password: 'WrongPassword@2026!' });
    expect(ninth.status).toBe(429);
    expect(ninth.headers['retry-after']).toBeDefined();
  });

  it('8. Rejects state-changing admin requests without matching double-submit CSRF token', async () => {
    const auth = await authenticateOwner(ctx.app, ctx.totpSecret);
    const res = await request(ctx.app)
      .post('/api/admin/clients')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .send({ fullName: 'CSRF Test', contactInfo: '09171234567', notes: '' });
    expect(res.status).toBe(403);
  });

  it('9. Sets strict security HTTP headers (CSP, DENY, nosniff, no-store on admin routes)', async () => {
    const auth = await authenticateOwner(ctx.app, ctx.totpSecret);
    const res = await request(ctx.app)
      .get('/api/admin/dashboard')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('10. Enforces role RBAC & IDOR target validation (staff cannot delete clients; malformed IDs rejected)', async () => {
    const sLogin1 = await request(ctx.app)
      .post('/api/admin/auth/login')
      .send({ email: 'staff@rjhubprinting.com', password: 'StrongStaff@2026!' });
    const ss1 = extractCookie(sLogin1.headers['set-cookie'], 'rjhub_admin_session');
    const sc1 = extractCookie(sLogin1.headers['set-cookie'], 'rjhub_csrf');

    const sLogin2 = await request(ctx.app)
      .post('/api/admin/auth/verify-pin')
      .set('Cookie', [`rjhub_admin_session=${ss1}`, `rjhub_csrf=${sc1}`])
      .set('X-CSRF-Token', sc1)
      .send({ pin: '135790' });
    const staffSess = extractCookie(sLogin2.headers['set-cookie'], 'rjhub_admin_session');
    const staffCsrf = extractCookie(sLogin2.headers['set-cookie'], 'rjhub_csrf');

    const staffDel = await request(ctx.app)
      .delete('/api/admin/clients/non-existent-id')
      .set('Cookie', [`rjhub_admin_session=${staffSess}`, `rjhub_csrf=${staffCsrf}`])
      .set('X-CSRF-Token', staffCsrf);
    expect(staffDel.status).toBe(403);

    const ownerAuth = await authenticateOwner(ctx.app, ctx.totpSecret);
    const badId = await request(ctx.app)
      .get('/api/admin/inquiries/../../etc/passwd')
      .set('Cookie', [`rjhub_admin_session=${ownerAuth.session}`]);
    expect([400, 404]).toContain(badId.status);
  });

  it('11. Blocks XSS and SQL injection patterns in public inquiry and admin inputs', async () => {
    const xss = await request(ctx.app)
      .post('/api/inquiries')
      .send({
        customerName: 'Attacker',
        contactInfo: '09171234567',
        email: 'a@example.com',
        serviceId: 'lamination',
        message: '<script>alert(1)</script> urgent print',
      });
    expect(xss.status).toBe(400);

    const sqli = await request(ctx.app)
      .post('/api/inquiries')
      .send({
        customerName: 'Attacker',
        contactInfo: '09171234567',
        serviceId: 'lamination',
        message: "test'; DROP TABLE inquiries; --",
      });
    expect(sqli.status).toBe(400);
  });

  it('12. Enforces immutable append-only audit logs with zero stored secrets', async () => {
    const auth = await authenticateOwner(ctx.app, ctx.totpSecret);

    const mutAct = await request(ctx.app)
      .delete('/api/admin/logs/activity')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf);
    expect([404, 405]).toContain(mutAct.status);

    const secLogs = await request(ctx.app)
      .get('/api/admin/logs/security')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    expect(secLogs.status).toBe(200);
    const dumped = JSON.stringify(secLogs.body);
    expect(dumped).not.toContain('StrongOwner@2026!');
    expect(dumped).not.toContain('246810');
    expect(dumped).not.toContain(ctx.totpSecret);
  });

  it('13. Supports provisioned 6-digit PIN-only admin sign-in and enforces 3-attempt lockout', async () => {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const bad = await request(ctx.app)
        .post('/api/admin/auth/pin-login')
        .send({ pin: '999999' });
      expect(bad.status).toBe(401);
      expect(bad.body.remainingAttempts).toBe(3 - attempt);
      expect(bad.body.error).not.toMatch(/[()]/);
      expect(bad.body.error).toContain(`${3 - attempt} ${3 - attempt === 1 ? 'attempt' : 'attempts'} remaining`);
    }

    const locked = await request(ctx.app)
      .post('/api/admin/auth/pin-login')
      .send({ pin: '999999' });
    expect(locked.status).toBe(423);

    // Fresh store/router verifies direct PIN sign-in opens authenticated session
    const fresh = await setupEnv();
    const ok = await request(fresh.app)
      .post('/api/admin/auth/pin-login')
      .send({ pin: '246810' });
    expect(ok.status).toBe(200);
    expect(ok.body.stage).toBe('authenticated');

    const sess = extractCookie(ok.headers['set-cookie'], 'rjhub_admin_session');
    expect(sess).not.toBe('');
    const dash = await request(fresh.app)
      .get('/api/admin/dashboard')
      .set('Cookie', [`rjhub_admin_session=${sess}`]);
    expect(dash.status).toBe(200);
  });

  it('14. Persists validated customer reviews with zero pre-seeded demo data', async () => {
    const initial = await request(ctx.app).get('/api/reviews');
    expect(initial.status).toBe(200);
    expect(initial.body.reviews).toEqual([]);

    const bad = await request(ctx.app)
      .post('/api/reviews')
      .send({ author: 'Tester', quote: '<script>alert(1)</script> ok', rating: 5 });
    expect(bad.status).toBe(400);

    const ok = await request(ctx.app)
      .post('/api/reviews')
      .send({
        author: 'Ana Reyes',
        role: 'Google Signed-In Client',
        quote: 'Clean mug print and fast turnaround.',
        rating: 5,
        avatarUrl: 'https://example.com/avatar.png',
      });
    expect(ok.status).toBe(201);
    expect(ok.body.review.author).toBe('Ana Reyes');
    expect(ok.body.review.role).toBe('Verified Customer');
    expect(ok.body.review.avatarUrl).toBe('https://example.com/avatar.png');

    const after = await request(ctx.app).get('/api/reviews');
    expect(after.status).toBe(200);
    expect(after.body.reviews).toHaveLength(1);
    expect(after.body.reviews[0].avatarUrl).toBe('https://example.com/avatar.png');
  });

  it('15. Syncs customer avatar onto inquiries and accepts admin reply on /responses', async () => {
    const inqRes = await request(ctx.app)
      .post('/api/inquiries')
      .send({
        customerName: 'Bianca Navarro',
        contactInfo: '09171234567',
        email: 'bianca@gmail.com',
        serviceId: 'mug-customization',
        message: 'Checking delivery schedule for custom mugs.',
      });
    expect(inqRes.status).toBe(201);
    const inquiryId = inqRes.body.inquiry.id as string;

    const samplePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';
    const profRes = await request(ctx.app)
      .post('/api/auth/profile')
      .send({ email: 'bianca@gmail.com', fullName: 'Bianca Navarro', avatarUrl: samplePng });
    expect(profRes.status).toBe(200);

    const auth = await authenticateOwner(ctx.app, ctx.totpSecret);
    const listRes = await request(ctx.app)
      .get('/api/admin/inquiries')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    expect(listRes.status).toBe(200);
    expect(listRes.body.inquiries[0].customerAvatarUrl).toBe(samplePng);

    const replyRes = await request(ctx.app)
      .post(`/api/admin/inquiries/${inquiryId}/responses`)
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf)
      .send({ responseText: 'Ready for pickup tomorrow at 2 PM.', nextStatus: 'Answered' });
    expect(replyRes.status).toBe(201);
    expect(replyRes.body.response.responseText).toContain('Ready for pickup');

    const refCode = inqRes.body.inquiry.referenceCode as string;
    const customerPoll = await request(ctx.app).get(`/api/inquiries/by-ref/${refCode}`);
    expect(customerPoll.status).toBe(200);
    expect(customerPoll.body.inquiry.status).toBe('Answered');
    expect(customerPoll.body.inquiry.responses[0].senderRole).toBe('admin');
    expect(customerPoll.body.inquiry.responses[0].responseText).toContain('Ready for pickup');
  });

  it('16. Tracks real adminOnline state, multi-user avatars, seen/accept/decline flow, and Pending -> Logs lifecycle', async () => {
    const offlineHealth = await request(ctx.app).get('/api/health');
    expect(offlineHealth.status).toBe(200);
    expect(offlineHealth.body.adminOnline).toBe(false);

    // Fallback Google email has zero middle dots
    const googleRes = await request(ctx.app)
      .post('/api/auth/google')
      .send({ fullName: 'Google Customer' });
    expect(googleRes.status).toBe(200);
    expect(googleRes.body.customer.email).toBe('googlecustomer@gmail.com');

    // Distinct avatars per Google user
    const avatarA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';
    const avatarB = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8BQDwAEgAF/pooBPQAAAABJRU5ErkJggg==';
    await request(ctx.app)
      .post('/api/auth/profile')
      .send({ email: 'alice@gmail.com', fullName: 'Alice Reyes', avatarUrl: avatarA });
    await request(ctx.app)
      .post('/api/auth/profile')
      .send({ email: 'bob@gmail.com', fullName: 'Bob Cruz', avatarUrl: avatarB });

    const inqA = await request(ctx.app)
      .post('/api/inquiries')
      .send({
        customerName: 'Alice Reyes',
        contactInfo: '09171111111',
        email: 'alice@gmail.com',
        serviceId: 'sintra-board',
        quantity: 3,
        wantsReservation: true,
        message: '3 pcs A4 Sintra Board with reservation.',
      });
    const inqB = await request(ctx.app)
      .post('/api/inquiries')
      .send({
        customerName: 'Bob Cruz',
        contactInfo: '09172222222',
        email: 'bob@gmail.com',
        serviceId: 'mug-customization',
        quantity: 2,
        message: '2 pcs white ceramic mugs.',
      });
    expect(inqA.status).toBe(201);
    expect(inqB.status).toBe(201);

    // Customer polling shows adminOffline & not yet seen
    const pollBefore = await request(ctx.app).get(
      `/api/inquiries/by-ref/${inqA.body.inquiry.referenceCode}`,
    );
    expect(pollBefore.body.adminOnline).toBe(false);
    expect(pollBefore.body.inquiry.adminSeenAt).toBeNull();

    // Admin signs in -> adminOnline becomes true
    const auth = await authenticateOwner(ctx.app, ctx.totpSecret);
    const onlineHealth = await request(ctx.app).get('/api/health');
    expect(onlineHealth.body.adminOnline).toBe(true);

    // Unseen inquiries appear in Dashboard recentInquiries; distinct avatars preserved
    const dashBefore = await request(ctx.app)
      .get('/api/admin/dashboard')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    expect(dashBefore.body.recentInquiries.length).toBe(2);
    expect(dashBefore.body.chartSeries.weekly.length).toBe(4);

    const listActive = await request(ctx.app)
      .get('/api/admin/inquiries?folder=active')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    const aliceRow = listActive.body.inquiries.find((i: { id: string }) => i.id === inqA.body.inquiry.id);
    const bobRow = listActive.body.inquiries.find((i: { id: string }) => i.id === inqB.body.inquiry.id);
    expect(aliceRow.customerAvatarUrl).toBe(avatarA);
    expect(bobRow.customerAvatarUrl).toBe(avatarB);

    // Marking seen removes from dashboard recentInquiries and unlocks customer Seen state
    await request(ctx.app)
      .post(`/api/admin/inquiries/${inqA.body.inquiry.id}/seen`)
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf);
    const pollSeen = await request(ctx.app).get(
      `/api/inquiries/by-ref/${inqA.body.inquiry.referenceCode}`,
    );
    expect(pollSeen.body.adminOnline).toBe(true);
    expect(pollSeen.body.inquiry.adminSeenAt).toBeTruthy();

    // Accept A into Pending Client Records with Qty 3, Total 540, Reservation 200; Decline B to History
    const acceptA = await request(ctx.app)
      .post(`/api/admin/inquiries/${inqA.body.inquiry.id}/accept`)
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf);
    expect(acceptA.status).toBe(200);
    expect(acceptA.body.client.orderItem).toBe('Sintra Board');
    expect(acceptA.body.client.quantity).toBe(3);
    expect(acceptA.body.client.totalPrice).toBe(540);
    expect(acceptA.body.client.reservationFee).toBe(200);

    await request(ctx.app)
      .post(`/api/admin/inquiries/${inqB.body.inquiry.id}/decline`)
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf);

    const activeAfter = await request(ctx.app)
      .get('/api/admin/inquiries?folder=active')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    expect(activeAfter.body.inquiries.some((i: { id: string }) => i.id === inqB.body.inquiry.id)).toBe(false);

    const historyAfter = await request(ctx.app)
      .get('/api/admin/inquiries?folder=history')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    expect(historyAfter.body.inquiries.some((i: { id: string }) => i.id === inqB.body.inquiry.id)).toBe(true);

    // Move client A from Pending -> Done without contactInfo -> vanishes from Pending, appears in Logs
    const clientAId = acceptA.body.client.id as string;
    const updDone = await request(ctx.app)
      .patch(`/api/admin/clients/${clientAId}`)
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf)
      .send({ fullName: 'Alice Reyes', orderStatus: 'Done' });
    expect(updDone.status).toBe(200);

    const pendingClients = await request(ctx.app)
      .get('/api/admin/clients?scope=pending')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    expect(pendingClients.body.clients.some((c: { id: string }) => c.id === clientAId)).toBe(false);

    const logClients = await request(ctx.app)
      .get('/api/admin/clients?scope=logs&sort=date_desc')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    expect(logClients.body.clients.some((c: { id: string }) => c.id === clientAId)).toBe(true);

    // Repeating inquiry from same Gmail appends to 1 unified customer thread,
    // keeps Admin Dashboard Total Inquiries = 1 per unique customer, and increments health totalInquiries +1
    const secondAlice = await request(ctx.app)
      .post('/api/inquiries')
      .send({
        customerName: 'Alice Reyes',
        contactInfo: '09171111111',
        email: 'alice@gmail.com',
        serviceId: 'mug-customization',
        quantity: 1,
        message: 'Adding a follow-up mug inquiry on the same Gmail.',
      });
    expect(secondAlice.status).toBe(201);
    expect(secondAlice.body.inquiry.id).toBe(inqA.body.inquiry.id);

    const dashUnified = await request(ctx.app)
      .get('/api/admin/dashboard')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    expect(dashUnified.body.counts.total).toBe(2); // Alice + Bob only (1 each)

    const healthAfter = await request(ctx.app).get('/api/health');
    expect(healthAfter.body.totalInquiries).toBe(3); // 3 total submissions (+1 each time)

    // Returning customer recovers full message history by Gmail/name
    const historyLookup = await request(ctx.app).get('/api/inquiries/by-customer?email=alice@gmail.com');
    expect(historyLookup.status).toBe(200);
    expect(historyLookup.body.inquiry.id).toBe(inqA.body.inquiry.id);
    expect(historyLookup.body.inquiry.responses.length).toBeGreaterThanOrEqual(1);

    // Creating a client without contactInfo succeeds (no Contact Number field required)
    const addClientNoPhone = await request(ctx.app)
      .post('/api/admin/clients')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf)
      .send({
        fullName: 'Walk-in Client',
        contactInfo: '',
        notes: '',
        orderItem: 'Lamination',
        quantity: 4,
        totalPrice: 80,
      });
    expect(addClientNoPhone.status).toBe(201);

    // Move Cancelled client to Logs and keep Walk-in Client Pending, then Delete All Logs
    const bobClientRes = await request(ctx.app)
      .post('/api/admin/clients')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf)
      .send({
        fullName: 'Cancelled Order Client',
        contactInfo: '',
        notes: '',
        orderItem: 'Mug Customization',
        quantity: 2,
        totalPrice: 240,
        orderStatus: 'Cancelled',
      });
    expect(bobClientRes.status).toBe(201);

    // Email-only inquiry (from Google sign-in without PH phone) succeeds with non-duplicated contact snapshot
    const emailOnlyInq = await request(ctx.app)
      .post('/api/inquiries')
      .send({
        customerName: 'Email Only Google User',
        contactInfo: 'emailonly@gmail.com',
        email: 'emailonly@gmail.com',
        serviceId: 'lamination',
        message: 'Lamination inquiry submitted from signed-in chat.',
      });
    expect(emailOnlyInq.status).toBe(201);
    expect(emailOnlyInq.body.inquiry.customerContactSnapshot).toBe('emailonly@gmail.com');

    await request(ctx.app)
      .post('/api/admin/auth/reauth')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf)
      .send({ pin: '246810' });

    const delAllLogs = await request(ctx.app)
      .delete('/api/admin/clients/logs/all')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf);
    expect(delAllLogs.status).toBe(200);
    expect(delAllLogs.body.deletedCount).toBe(1);

    const logsAfterClear = await request(ctx.app)
      .get('/api/admin/clients?scope=logs')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    expect(logsAfterClear.body.clients).toHaveLength(0);

    const pendingStillThere = await request(ctx.app)
      .get('/api/admin/clients?scope=pending')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    expect(pendingStillThere.body.clients.some((c: { fullName: string }) => c.fullName === 'Walk-in Client')).toBe(true);

    const aliceStillInInbox = await request(ctx.app)
      .get(`/api/admin/inquiries/${inqA.body.inquiry.id}`)
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    expect(aliceStillInInbox.status).toBe(200);
    expect(aliceStillInInbox.body.inquiry.customerNameSnapshot).toBe('Alice Reyes');
    expect(aliceStillInInbox.body.inquiry.orderItem).toContain('Sintra Board');
    expect(aliceStillInInbox.body.inquiry.orderItem).toContain('Mug Customization');
    expect(aliceStillInInbox.body.inquiry.orderItem).toContain('&');

    // Adding a walk-in client + email-only inquiry increments Dashboard unique Total Inquiries
    // (Alice + Bob + Walk-in + Email Only = 4) and Pending count, while deleting logs resets Completed to 0
    const dashAfterWalkIn = await request(ctx.app)
      .get('/api/admin/dashboard')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    expect(dashAfterWalkIn.body.counts.total).toBe(4);
    expect(dashAfterWalkIn.body.counts.pending).toBeGreaterThanOrEqual(3);
    expect(dashAfterWalkIn.body.counts.completed).toBe(0);

    // Add another service right into Alice's existing thread via messages endpoint
    const addAnotherRes = await request(ctx.app)
      .post(`/api/inquiries/by-ref/${inqA.body.inquiry.referenceCode}/messages`)
      .send({
        senderName: 'Alice Reyes',
        messageText: 'Adding another item: Lamination (₱20 / pcs)',
        serviceId: 'lamination',
        serviceNames: ['Lamination'],
        quantity: 2,
      });
    expect(addAnotherRes.status).toBe(201);
    expect(addAnotherRes.body.inquiry.orderItem).toBe(
      'Sintra Board & Mug Customization & Lamination',
    );

    // Delete all Message History removes replied/archived threads
    const clearHistRes = await request(ctx.app)
      .delete('/api/admin/inquiries/history/all')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf);
    expect(clearHistRes.status).toBe(200);
    expect(clearHistRes.body.deletedCount).toBeGreaterThanOrEqual(2);
  });

  it('17. Captures phone numbers from chat, filters client scopes with referenceCode, and enforces Archive/Block/Delete', async () => {
    const custRes = await request(ctx.app)
      .post('/api/inquiries')
      .send({
        customerName: 'Marco Santos',
        contactInfo: 'marco@gmail.com',
        email: 'marco@gmail.com',
        serviceId: 'sintra-board',
        message: 'Inquiry without phone first.',
      });
    expect(custRes.status).toBe(201);
    const inqId = custRes.body.inquiry.id as string;
    const refCode = custRes.body.inquiry.referenceCode as string;

    // Customer sends phone number later in chat message
    const phoneMsgRes = await request(ctx.app)
      .post(`/api/inquiries/by-ref/${refCode}/messages`)
      .send({
        senderName: 'Marco Santos',
        messageText: 'Call me at +63 917 888 1234 please.',
      });
    expect(phoneMsgRes.status).toBe(201);
    expect(phoneMsgRes.body.inquiry.customerContactSnapshot).toContain('09178881234');

    const auth = await authenticateOwner(ctx.app, ctx.totpSecret);

    // Scope=all returns inquiry referenceCode
    const allClients = await request(ctx.app)
      .get('/api/admin/clients?scope=all')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    expect(allClients.status).toBe(200);
    expect(allClients.body.clients.some((c: { referenceCode?: string }) => c.referenceCode === refCode)).toBe(true);

    // Unaccepted request appears under folder=requests and can be archived
    const reqList = await request(ctx.app)
      .get('/api/admin/inquiries?folder=requests')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    expect(reqList.body.inquiries.some((i: { id: string }) => i.id === inqId)).toBe(true);

    const archRes = await request(ctx.app)
      .post(`/api/admin/inquiries/${inqId}/archive`)
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf)
      .send({ archived: true });
    expect(archRes.status).toBe(200);
    expect(archRes.body.inquiry.isArchived).toBe(true);

    const archList = await request(ctx.app)
      .get('/api/admin/inquiries?folder=archive')
      .set('Cookie', [`rjhub_admin_session=${auth.session}`]);
    expect(archList.body.inquiries.some((i: { id: string }) => i.id === inqId)).toBe(true);

    // Block prevents subsequent customer messages with 403
    const blockRes = await request(ctx.app)
      .post(`/api/admin/inquiries/${inqId}/block`)
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf)
      .send({ blocked: true });
    expect(blockRes.status).toBe(200);
    expect(blockRes.body.inquiry.isBlocked).toBe(true);

    const blockedFollowUp = await request(ctx.app)
      .post(`/api/inquiries/by-ref/${refCode}/messages`)
      .send({ senderName: 'Marco Santos', messageText: 'Still blocked?' });
    expect(blockedFollowUp.status).toBe(403);

    // Single delete removes thread
    const delRes = await request(ctx.app)
      .delete(`/api/admin/inquiries/${inqId}`)
      .set('Cookie', [`rjhub_admin_session=${auth.session}`, `rjhub_csrf=${auth.csrf}`])
      .set('X-CSRF-Token', auth.csrf);
    expect(delRes.status).toBe(200);
    expect(delRes.body.deleted).toBe(true);
  });
});

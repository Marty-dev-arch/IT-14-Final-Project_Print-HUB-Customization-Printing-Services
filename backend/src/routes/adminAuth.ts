import { Router, type Response } from 'express';
import type { AdminRecord, AuthStage, BackendStore } from '../db/types.js';
import {
  ABSOLUTE_TIMEOUT_MS,
  getClientIp,
  requireAdminSession,
  type AuthenticatedAdminRequest,
} from '../middleware/auth.js';
import {
  buildOtpAuthUri,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashArgon2,
  randomToken,
  sha256Hex,
  verifyArgon2,
  verifyTotpCode,
} from '../security/crypto.js';
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from '../security/csrf.js';
import { enforceRateLimit } from '../security/rateLimit.js';
import {
  cleanText,
  isValidEmail,
  validatePinFormat,
  validateTotpOrRecovery,
} from '../security/validation.js';

const MAX_PIN_ATTEMPTS = 3;
const COOLDOWN_MINUTES = 3;
const pendingTotpEnroll = new Map<string, { secret: string; recoveryPlain: string[]; recoveryHashes: string[] }>();

function setSessionCookies(res: Response, rawSessionToken: string, rawCsrfToken: string) {
  const isProd = process.env.NODE_ENV === 'production';
  const domain = process.env.COOKIE_DOMAIN?.trim() || undefined;
  const base = {
    sameSite: 'strict' as const,
    secure: isProd,
    path: '/',
    maxAge: ABSOLUTE_TIMEOUT_MS,
    ...(domain ? { domain } : {}),
  };
  res.cookie(SESSION_COOKIE_NAME, rawSessionToken, { ...base, httpOnly: true });
  res.cookie(CSRF_COOKIE_NAME, rawCsrfToken, { ...base, httpOnly: false });
}

function clearSessionCookies(res: Response) {
  const domain = process.env.COOKIE_DOMAIN?.trim() || undefined;
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/', ...(domain ? { domain } : {}) });
  res.clearCookie(CSRF_COOKIE_NAME, { path: '/', ...(domain ? { domain } : {}) });
}

function sanitizeAdminPublic(admin: AdminRecord, authStage?: AuthStage) {
  return {
    id: admin.id,
    email: admin.email,
    displayName: admin.displayName,
    role: admin.role,
    mfaEnabled: admin.mfaEnabled,
    lastLoginAt: admin.lastLoginAt,
    ...(authStage ? { authStage } : {}),
  };
}

export function createAdminAuthRouter(store: BackendStore): Router {
  const router = Router();
  const pinIpLocks = new Map<string, number>();

  // Disabled public admin registration explicitly
  router.post('/register', (_req, res) => {
    res.status(403).json({
      error: 'Public administrator registration is disabled. Accounts must be provisioned server-side.',
    });
  });

  // Streamlined 6-digit PIN login for provisioned administrators (max 3 attempts + 15m cooldown)
  router.post('/pin-login', async (req, res) => {
    const ip = getClientIp(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const pinErr = validatePinFormat(body.pin);
    if (pinErr) {
      res.status(400).json({ error: pinErr });
      return;
    }

    const lockedUntilMs = pinIpLocks.get(ip);
    if (lockedUntilMs && lockedUntilMs > Date.now()) {
      const retrySec = Math.ceil((lockedUntilMs - Date.now()) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retrySec)));
      res.status(423).json({
        error: `PIN sign-in temporarily locked for ${COOLDOWN_MINUTES} minutes. Try again later.`,
      });
      return;
    }

    const rate = await enforceRateLimit(store, 'admin_pin_login', [ip], 10, COOLDOWN_MINUTES * 60);
    if (!rate.allowed) {
      await store.appendSecurityLog({
        eventType: 'PIN_RATE_LIMITED',
        severity: 'warn',
        actorIdentity: ip,
        ipAddress: ip,
        description: 'Exceeded maximum PIN login rate limit.',
        targetId: null,
        details: { count: rate.count },
      });
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({ error: 'Too many authentication attempts. Try again later.' });
      return;
    }

    const pin = cleanText(body.pin);
    const admins = await store.listAdmins();
    let matched: AdminRecord | null = null;
    for (const candidate of admins) {
      if (verifyArgon2(pin, candidate.pinHash)) {
        matched = candidate;
        break;
      }
    }

    if (!matched) {
      const failBucket = await store.incrementRateLimit(`admin_pin_fail:${ip}`, COOLDOWN_MINUTES * 60);
      const locked = failBucket.count >= MAX_PIN_ATTEMPTS;
      if (locked) {
        pinIpLocks.set(ip, Date.now() + COOLDOWN_MINUTES * 60 * 1000);
      }
      await store.appendSecurityLog({
        eventType: locked ? 'PIN_LOCKOUT_TRIGGERED' : 'PIN_FAILED',
        severity: locked ? 'critical' : 'warn',
        actorIdentity: ip,
        ipAddress: ip,
        description: locked
          ? `PIN sign-in locked for ${COOLDOWN_MINUTES} minutes after ${failBucket.count} failed attempts.`
          : `Incorrect 6-digit PIN attempt ${failBucket.count}/${MAX_PIN_ATTEMPTS}.`,
        targetId: null,
        details: { attempts: failBucket.count },
      });
      if (locked) {
        res.setHeader('Retry-After', String(COOLDOWN_MINUTES * 60));
        res.status(423).json({
          error: `Maximum ${MAX_PIN_ATTEMPTS} PIN attempts exceeded. Cooldown active for ${COOLDOWN_MINUTES} minutes.`,
        });
        return;
      }
      res.status(401).json({
        error: `Incorrect 6-digit PIN (${MAX_PIN_ATTEMPTS - failBucket.count} attempt(s) remaining).`,
        remainingAttempts: MAX_PIN_ATTEMPTS - failBucket.count,
      });
      return;
    }

    if (matched.pinLockedUntil && new Date(matched.pinLockedUntil).getTime() > Date.now()) {
      const retrySec = Math.ceil((new Date(matched.pinLockedUntil).getTime() - Date.now()) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retrySec)));
      res.status(423).json({ error: 'Administrator PIN temporarily locked. Try again later.' });
      return;
    }

    pinIpLocks.delete(ip);
    const rawSession = randomToken(32);
    const rawCsrf = randomToken(24);
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + ABSOLUTE_TIMEOUT_MS).toISOString();

    await store.updateAdminSecurity(matched.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      lastLoginAt: nowIso,
    });

    const session = await store.createSession({
      adminId: matched.id,
      tokenHash: sha256Hex(rawSession),
      csrfTokenHash: sha256Hex(rawCsrf),
      authStage: 'mfa_verified',
      ipAddress: ip,
      userAgent: (req.get('user-agent') ?? '').slice(0, 220),
      lastActiveAt: nowIso,
      expiresAt: expiresIso,
      reauthVerifiedAt: nowIso,
      revokedAt: null,
    });

    await store.appendSecurityLog({
      eventType: 'ADMIN_LOGIN_SUCCESS',
      severity: 'info',
      actorIdentity: matched.email,
      ipAddress: ip,
      description: 'Administrator signed in with 6-digit security PIN.',
      targetId: session.id,
      details: {},
    });

    setSessionCookies(res, rawSession, rawCsrf);
    res.json({
      stage: 'authenticated',
      admin: sanitizeAdminPublic(matched, 'mfa_verified'),
    });
  });

  // Layer 1: Email + Argon2id Password (uniform response prevents account enumeration)
  router.post('/login', async (req, res) => {
    const ip = getClientIp(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = cleanText(body.email).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';

    const rate = await enforceRateLimit(store, 'admin_login', [ip, email || 'unknown'], 8, 900);
    if (!rate.allowed) {
      await store.appendSecurityLog({
        eventType: 'LOGIN_RATE_LIMITED',
        severity: 'warn',
        actorIdentity: email || 'unknown',
        ipAddress: ip,
        description: 'Exceeded maximum login rate limit.',
        targetId: null,
        details: { count: rate.count },
      });
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({ error: 'Too many authentication attempts. Try again later.' });
      return;
    }

    if (!email || !isValidEmail(email) || !password) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const admin = await store.findAdminByEmail(email);
    if (!admin) {
      await store.appendSecurityLog({
        eventType: 'LOGIN_FAILED',
        severity: 'warn',
        actorIdentity: email,
        ipAddress: ip,
        description: 'Failed login attempt for unrecognized administrator email.',
        targetId: null,
        details: {},
      });
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    if (admin.lockedUntil && new Date(admin.lockedUntil).getTime() > Date.now()) {
      const retrySec = Math.ceil((new Date(admin.lockedUntil).getTime() - Date.now()) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retrySec)));
      res.status(423).json({ error: 'Administrator account temporarily locked. Try again later.' });
      return;
    }

    const passwordValid = verifyArgon2(password, admin.passwordHash);
    if (!passwordValid) {
      const nextFails = admin.failedLoginAttempts + 1;
      const lockedUntil =
        nextFails >= 5 ? new Date(Date.now() + COOLDOWN_MINUTES * 60 * 1000).toISOString() : null;
      await store.updateAdminSecurity(admin.id, {
        failedLoginAttempts: nextFails,
        lockedUntil,
      });
      await store.appendSecurityLog({
        eventType: lockedUntil ? 'ACCOUNT_LOCKED_PASSWORD' : 'LOGIN_FAILED',
        severity: lockedUntil ? 'critical' : 'warn',
        actorIdentity: admin.email,
        ipAddress: ip,
        description: lockedUntil
          ? `Account temporarily locked after ${nextFails} failed password attempts.`
          : `Failed password verification attempt #${nextFails}.`,
        targetId: admin.id,
        details: { attempts: nextFails },
      });
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    await store.updateAdminSecurity(admin.id, { failedLoginAttempts: 0, lockedUntil: null });

    const rawSession = randomToken(32);
    const rawCsrf = randomToken(24);
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + ABSOLUTE_TIMEOUT_MS).toISOString();

    const session = await store.createSession({
      adminId: admin.id,
      tokenHash: sha256Hex(rawSession),
      csrfTokenHash: sha256Hex(rawCsrf),
      authStage: 'password_ok',
      ipAddress: ip,
      userAgent: (req.get('user-agent') ?? '').slice(0, 220),
      lastActiveAt: nowIso,
      expiresAt: expiresIso,
      reauthVerifiedAt: null,
      revokedAt: null,
    });

    await store.appendSecurityLog({
      eventType: 'SESSION_CREATED',
      severity: 'info',
      actorIdentity: admin.email,
      ipAddress: ip,
      description: 'Layer 1 password verified; awaiting 6-digit security PIN.',
      targetId: session.id,
      details: {},
    });

    setSessionCookies(res, rawSession, rawCsrf);
    res.json({
      stage: 'pin_required',
      admin: sanitizeAdminPublic(admin, 'password_ok'),
    });
  });

  // Layer 2: Six-Digit Argon2id PIN Verification (Max 3 Attempts + Cooldown + Rotation)
  router.post(
    '/verify-pin',
    requireAdminSession(store, { minStage: 'password_ok' }),
    async (req: AuthenticatedAdminRequest, res) => {
      const admin = req.admin!;
      const session = req.adminSession!;
      const ip = getClientIp(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const pinErr = validatePinFormat(body.pin);
      if (pinErr) {
        res.status(400).json({ error: pinErr });
        return;
      }

      const rate = await enforceRateLimit(store, 'admin_pin', [admin.id, ip], 5, COOLDOWN_MINUTES * 60);
      if (!rate.allowed) {
        res.setHeader('Retry-After', String(rate.retryAfterSec));
        res.status(429).json({ error: 'PIN verification rate limit exceeded.' });
        return;
      }

      if (admin.pinLockedUntil && new Date(admin.pinLockedUntil).getTime() > Date.now()) {
        const retrySec = Math.ceil((new Date(admin.pinLockedUntil).getTime() - Date.now()) / 1000);
        res.setHeader('Retry-After', String(Math.max(1, retrySec)));
        res.status(423).json({
          error: 'PIN verification temporarily locked after repeated failures. Try again later.',
        });
        return;
      }

      const pin = cleanText(body.pin);
      if (!verifyArgon2(pin, admin.pinHash)) {
        const nextPinFails = admin.pinFailedAttempts + 1;
        const locked = nextPinFails >= MAX_PIN_ATTEMPTS;
        const lockUntilIso = locked
          ? new Date(Date.now() + COOLDOWN_MINUTES * 60 * 1000).toISOString()
          : null;
        await store.updateAdminSecurity(admin.id, {
          pinFailedAttempts: nextPinFails,
          pinLockedUntil: lockUntilIso,
        });
        await store.appendSecurityLog({
          eventType: locked ? 'PIN_LOCKOUT_TRIGGERED' : 'PIN_FAILED',
          severity: locked ? 'critical' : 'warn',
          actorIdentity: admin.email,
          ipAddress: ip,
          description: locked
            ? `PIN locked for ${COOLDOWN_MINUTES} minutes after ${nextPinFails} failed attempts.`
            : `Incorrect 6-digit PIN attempt ${nextPinFails}/${MAX_PIN_ATTEMPTS}.`,
          targetId: admin.id,
          details: { attempts: nextPinFails },
        });
        if (locked) {
          await store.revokeSession(session.id);
          clearSessionCookies(res);
          res.setHeader('Retry-After', String(COOLDOWN_MINUTES * 60));
          res.status(423).json({
            error: `Maximum ${MAX_PIN_ATTEMPTS} PIN attempts exceeded. Cooldown active for ${COOLDOWN_MINUTES} minutes.`,
          });
          return;
        }
        res.status(401).json({
          error: `Incorrect 6-digit PIN (${MAX_PIN_ATTEMPTS - nextPinFails} attempt(s) remaining).`,
          remainingAttempts: MAX_PIN_ATTEMPTS - nextPinFails,
        });
        return;
      }

      // Reset failure counters & rotate session + CSRF tokens
      const newRawToken = randomToken(32);
      const newRawCsrf = randomToken(24);
      const nowIso = new Date().toISOString();
      const nextStage: AuthStage = admin.mfaEnabled ? 'pin_ok' : 'mfa_verified';

      await store.updateAdminSecurity(admin.id, {
        pinFailedAttempts: 0,
        pinLockedUntil: null,
        ...(!admin.mfaEnabled ? { lastLoginAt: nowIso } : {}),
      });
      await store.updateSession(session.id, {
        tokenHash: sha256Hex(newRawToken),
        csrfTokenHash: sha256Hex(newRawCsrf),
        authStage: nextStage,
        reauthVerifiedAt: nowIso,
      });

      if (!admin.mfaEnabled) {
        await store.appendSecurityLog({
          eventType: 'ADMIN_LOGIN_SUCCESS',
          severity: 'info',
          actorIdentity: admin.email,
          ipAddress: ip,
          description: 'Administrator signed in after Layer 1 & Layer 2 verification.',
          targetId: session.id,
          details: {},
        });
      }

      setSessionCookies(res, newRawToken, newRawCsrf);
      res.json({
        stage: admin.mfaEnabled ? 'mfa_required' : 'authenticated',
        admin: sanitizeAdminPublic(admin, nextStage),
      });
    },
  );

  // Layer 3: TOTP Authenticator or Single-Use Recovery Code Verification
  router.post(
    '/verify-mfa',
    requireAdminSession(store, { minStage: 'pin_ok' }),
    async (req: AuthenticatedAdminRequest, res) => {
      const admin = req.admin!;
      const session = req.adminSession!;
      const ip = getClientIp(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const fmtErr = validateTotpOrRecovery(body.code);
      if (fmtErr) {
        res.status(400).json({ error: fmtErr });
        return;
      }

      const rate = await enforceRateLimit(store, 'admin_mfa', [admin.id, ip], 5, 600);
      if (!rate.allowed) {
        res.setHeader('Retry-After', String(rate.retryAfterSec));
        res.status(429).json({ error: 'MFA verification rate limit exceeded.' });
        return;
      }

      const code = cleanText(body.code).toUpperCase();
      let verified = false;
      let nextTotpStep = admin.lastTotpStep;
      let nextRecoveryHashes = admin.recoveryCodeHashes;

      if (/^\d{6}$/.test(code) && admin.totpSecretEncrypted) {
        const secret = decryptSecret(admin.totpSecretEncrypted);
        const check = verifyTotpCode(secret, code, admin.lastTotpStep);
        if (check.valid) {
          verified = true;
          nextTotpStep = check.step;
        }
      } else {
        const matchIdx = admin.recoveryCodeHashes.findIndex((h) => verifyArgon2(code, h));
        if (matchIdx >= 0) {
          verified = true;
          nextRecoveryHashes = admin.recoveryCodeHashes.filter((_, idx) => idx !== matchIdx);
        }
      }

      if (!verified) {
        await store.appendSecurityLog({
          eventType: 'MFA_FAILED',
          severity: 'warn',
          actorIdentity: admin.email,
          ipAddress: ip,
          description: 'Invalid TOTP or recovery code during MFA verification.',
          targetId: admin.id,
          details: {},
        });
        res.status(401).json({ error: 'Invalid authenticator or recovery code.' });
        return;
      }

      const newRawToken = randomToken(32);
      const newRawCsrf = randomToken(24);
      const nowIso = new Date().toISOString();

      await store.updateAdminSecurity(admin.id, {
        lastTotpStep: nextTotpStep,
        recoveryCodeHashes: nextRecoveryHashes,
        lastLoginAt: nowIso,
      });
      await store.updateSession(session.id, {
        tokenHash: sha256Hex(newRawToken),
        csrfTokenHash: sha256Hex(newRawCsrf),
        authStage: 'mfa_verified',
        reauthVerifiedAt: nowIso,
      });

      await store.appendSecurityLog({
        eventType: 'ADMIN_LOGIN_SUCCESS',
        severity: 'info',
        actorIdentity: admin.email,
        ipAddress: ip,
        description: 'Administrator completed 4-layer MFA authentication.',
        targetId: session.id,
        details: {},
      });

      setSessionCookies(res, newRawToken, newRawCsrf);
      res.json({
        stage: 'authenticated',
        admin: sanitizeAdminPublic(admin, 'mfa_verified'),
      });
    },
  );

  // Step-Up Reauthentication with 6-digit PIN for destructive operations
  router.post(
    '/reauth',
    requireAdminSession(store, { minStage: 'mfa_verified' }),
    async (req: AuthenticatedAdminRequest, res) => {
      const admin = req.admin!;
      const session = req.adminSession!;
      const ip = getClientIp(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const pinErr = validatePinFormat(body.pin);
      if (pinErr) {
        res.status(400).json({ error: pinErr });
        return;
      }

      if (!verifyArgon2(cleanText(body.pin), admin.pinHash)) {
        await store.appendSecurityLog({
          eventType: 'REAUTH_FAILED',
          severity: 'warn',
          actorIdentity: admin.email,
          ipAddress: ip,
          description: 'Failed step-up PIN reauthentication attempt.',
          targetId: session.id,
          details: {},
        });
        res.status(401).json({ error: 'Incorrect security PIN.' });
        return;
      }

      const nowIso = new Date().toISOString();
      await store.updateSession(session.id, { reauthVerifiedAt: nowIso });
      res.json({ reauthVerifiedAt: nowIso });
    },
  );

  // TOTP Enrollment (requires authenticated session)
  router.post(
    '/mfa/enroll',
    requireAdminSession(store, { minStage: 'mfa_verified' }),
    async (req: AuthenticatedAdminRequest, res) => {
      const admin = req.admin!;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const action = cleanText(body.action) || 'begin';

      if (action === 'begin') {
        const secret = generateTotpSecret();
        const { plain, hashes } = generateRecoveryCodes(8);
        pendingTotpEnroll.set(admin.id, { secret, recoveryPlain: plain, recoveryHashes: hashes });
        res.json({
          secret,
          otpauthUri: buildOtpAuthUri(admin.email, secret),
          recoveryCodes: plain,
        });
        return;
      }

      if (action === 'confirm') {
        const pending = pendingTotpEnroll.get(admin.id);
        const code = cleanText(body.code);
        if (!pending) {
          res.status(400).json({ error: 'Start MFA enrollment first.' });
          return;
        }
        const check = verifyTotpCode(pending.secret, code);
        if (!check.valid) {
          res.status(401).json({ error: 'Invalid 6-digit authenticator code.' });
          return;
        }
        await store.updateAdminSecurity(admin.id, {
          totpSecretEncrypted: encryptSecret(pending.secret),
          mfaEnabled: true,
          recoveryCodeHashes: pending.recoveryHashes,
          lastTotpStep: check.step,
        });
        pendingTotpEnroll.delete(admin.id);
        await store.appendSecurityLog({
          eventType: 'MFA_ENABLED',
          severity: 'info',
          actorIdentity: admin.email,
          ipAddress: getClientIp(req),
          description: 'Enabled TOTP Multi-Factor Authentication.',
          targetId: admin.id,
          details: {},
        });
        res.json({ mfaEnabled: true });
        return;
      }

      res.status(400).json({ error: 'Unsupported MFA action.' });
    },
  );

  router.patch(
    '/pin',
    requireAdminSession(store, { minStage: 'mfa_verified' }),
    async (req: AuthenticatedAdminRequest, res) => {
      const admin = req.admin!;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const curErr = validatePinFormat(body.currentPin);
      const nextErr = validatePinFormat(body.newPin);
      if (curErr || nextErr) {
        res.status(400).json({ error: curErr || nextErr });
        return;
      }
      if (!verifyArgon2(cleanText(body.currentPin), admin.pinHash)) {
        res.status(401).json({ error: 'Current 6-digit PIN is incorrect.' });
        return;
      }
      await store.updateAdminSecurity(admin.id, {
        pinHash: hashArgon2(cleanText(body.newPin)),
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      });
      await store.appendSecurityLog({
        eventType: 'PIN_ROTATED',
        severity: 'info',
        actorIdentity: admin.email,
        ipAddress: getClientIp(req),
        description: 'Administrator updated 6-digit security PIN.',
        targetId: admin.id,
        details: {},
      });
      res.json({ updated: true });
    },
  );

  router.get(
    '/me',
    requireAdminSession(store, { minStage: 'password_ok' }),
    (req: AuthenticatedAdminRequest, res) => {
      const admin = req.admin!;
      const session = req.adminSession!;
      const stage =
        session.authStage === 'password_ok'
          ? 'pin_required'
          : session.authStage === 'pin_ok' && admin.mfaEnabled
            ? 'mfa_required'
            : 'authenticated';
      res.json({
        stage,
        admin: sanitizeAdminPublic(admin, session.authStage),
        sessionId: session.id,
        expiresAt: session.expiresAt,
      });
    },
  );

  router.post(
    '/logout',
    requireAdminSession(store, { minStage: 'password_ok' }),
    async (req: AuthenticatedAdminRequest, res) => {
      const admin = req.admin!;
      const session = req.adminSession!;
      await store.revokeSession(session.id);
      await store.appendSecurityLog({
        eventType: 'SESSION_TERMINATED',
        severity: 'info',
        actorIdentity: admin.email,
        ipAddress: getClientIp(req),
        description: 'Administrator signed out and revoked active session.',
        targetId: session.id,
        details: {},
      });
      clearSessionCookies(res);
      res.json({ ok: true });
    },
  );

  return router;
}

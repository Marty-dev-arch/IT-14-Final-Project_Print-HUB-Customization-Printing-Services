import type { NextFunction, Request, Response } from 'express';
import type {
  AdminRecord,
  AdminRole,
  AdminSessionRecord,
  AuthStage,
  BackendStore,
} from '../db/types.js';
import { sha256Hex } from '../security/crypto.js';
import { SESSION_COOKIE_NAME, verifyDoubleSubmitCsrf } from '../security/csrf.js';

export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

export interface AuthenticatedAdminRequest extends Request {
  admin?: AdminRecord;
  adminSession?: AdminSessionRecord;
}

const STAGE_RANK: Record<AuthStage, number> = {
  password_ok: 1,
  pin_ok: 2,
  mfa_verified: 3,
};

export function getClientIp(req: Request): string {
  const fwd = req.get('x-forwarded-for');
  if (fwd) {
    return fwd.split(',')[0]?.trim() || 'unknown';
  }
  return req.ip || 'unknown';
}

export function requireAdminSession(
  store: BackendStore,
  options: {
    minStage?: AuthStage;
    allowedRoles?: readonly AdminRole[];
    requireReauthMinutes?: number;
  } = {},
) {
  const { minStage = 'mfa_verified', allowedRoles, requireReauthMinutes } = options;

  return async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (!rawToken || typeof rawToken !== 'string') {
      res.status(401).json({ error: 'Administrator authentication required.' });
      return;
    }

    const session = await store.findSessionByTokenHash(sha256Hex(rawToken));
    if (!session || session.revokedAt) {
      res.status(401).json({ error: 'Session is invalid or has been revoked.' });
      return;
    }

    const nowMs = Date.now();
    const expiresMs = new Date(session.expiresAt).getTime();
    const idleExpired = nowMs - new Date(session.lastActiveAt).getTime() > IDLE_TIMEOUT_MS;
    if (nowMs >= expiresMs || idleExpired) {
      await store.revokeSession(session.id);
      await store.appendSecurityLog({
        eventType: 'SESSION_EXPIRED',
        severity: 'info',
        actorIdentity: session.adminId,
        ipAddress: getClientIp(req),
        description: idleExpired
          ? 'Session terminated after 15-minute idle timeout.'
          : 'Session terminated after 8-hour maximum lifetime.',
        targetId: session.id,
        details: { idleExpired },
      });
      res.status(401).json({ error: 'Session expired. Please sign in again.' });
      return;
    }

    const admin = await store.findAdminById(session.adminId);
    if (!admin) {
      await store.revokeSession(session.id);
      res.status(401).json({ error: 'Administrator account unavailable.' });
      return;
    }

    // Verify CSRF before mutating routes
    let csrfPassed = false;
    verifyDoubleSubmitCsrf(
      req,
      res,
      () => {
        csrfPassed = true;
      },
      session.csrfTokenHash,
    );
    if (!csrfPassed) return;

    // Enforce step-up authentication stage
    const effectiveMinStage: AuthStage =
      minStage === 'mfa_verified' && !admin.mfaEnabled ? 'pin_ok' : minStage;

    if (STAGE_RANK[session.authStage] < STAGE_RANK[effectiveMinStage]) {
      res.status(403).json({
        error: 'Additional authentication step required.',
        requiredStage: effectiveMinStage,
      });
      return;
    }

    if (allowedRoles && !allowedRoles.includes(admin.role)) {
      await store.appendSecurityLog({
        eventType: 'RBAC_FORBIDDEN',
        severity: 'warn',
        actorIdentity: admin.email,
        ipAddress: getClientIp(req),
        description: `Role "${admin.role}" denied access to ${req.method} ${req.path}.`,
        targetId: null,
        details: { role: admin.role },
      });
      res.status(403).json({ error: 'Insufficient administrator role privileges.' });
      return;
    }

    if (requireReauthMinutes) {
      const reauthMs = session.reauthVerifiedAt ? new Date(session.reauthVerifiedAt).getTime() : 0;
      if (!reauthMs || nowMs - reauthMs > requireReauthMinutes * 60 * 1000) {
        res.status(403).json({
          error: 'Fresh PIN verification required before performing this sensitive action.',
          requireReauth: true,
        });
        return;
      }
    }

    const touched = await store.updateSession(session.id, {
      lastActiveAt: new Date(nowMs).toISOString(),
    });
    req.admin = admin;
    req.adminSession = touched ?? session;
    next();
  };
}

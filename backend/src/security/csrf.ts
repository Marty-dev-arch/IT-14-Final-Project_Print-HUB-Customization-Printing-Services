import type { NextFunction, Request, Response } from 'express';
import { sha256Hex, timingSafeEqualStr } from './crypto.js';

export const SESSION_COOKIE_NAME = 'rjhub_admin_session';
export const CSRF_COOKIE_NAME = 'rjhub_csrf';
export const CUSTOMER_COOKIE_NAME = 'rjhub_customer_session';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function verifyDoubleSubmitCsrf(
  req: Request,
  res: Response,
  next: NextFunction,
  expectedCsrfTokenHash?: string,
) {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get('x-csrf-token') ?? '';
  if (!cookieToken || !headerToken || !timingSafeEqualStr(cookieToken, headerToken)) {
    res.status(403).json({ error: 'CSRF token missing or invalid.' });
    return;
  }
  if (expectedCsrfTokenHash && !timingSafeEqualStr(sha256Hex(headerToken), expectedCsrfTokenHash)) {
    res.status(403).json({ error: 'CSRF session mismatch.' });
    return;
  }
  next();
}

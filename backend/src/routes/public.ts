import { Router } from 'express';
import type { BackendStore } from '../db/types.js';
import { getClientIp, IDLE_TIMEOUT_MS } from '../middleware/auth.js';
import { randomToken, sha256Hex } from '../security/crypto.js';
import { CUSTOMER_COOKIE_NAME } from '../security/csrf.js';
import { enforceRateLimit } from '../security/rateLimit.js';
import {
  cleanText,
  isValidEmail,
  isValidId,
  validateInquiryPayload,
  validateReplyPayload,
  validateReviewPayload,
} from '../security/validation.js';

interface GoogleTokenInfo {
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  aud?: string;
}

function sanitizeAvatarUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2_000_000) return undefined;
  if (/^(https:\/\/|\/services\/|data:image\/(?:png|jpeg|jpg|webp|gif);base64,)/i.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

async function isAnyAdminOnline(store: BackendStore): Promise<boolean> {
  const sessions = await store.listAdminSessions();
  const now = Date.now();
  return sessions.some(
    (s) =>
      !s.revokedAt &&
      (s.authStage === 'pin_ok' || s.authStage === 'mfa_verified') &&
      new Date(s.expiresAt).getTime() > now &&
      now - new Date(s.lastActiveAt).getTime() <= IDLE_TIMEOUT_MS,
  );
}

export function createPublicRouter(store: BackendStore): Router {
  const router = Router();
  const isProd = process.env.NODE_ENV === 'production';

  router.get('/health', async (_req, res) => {
    const [adminOnline, totalInquiries] = await Promise.all([
      isAnyAdminOnline(store),
      store.getTotalInquirySubmissions(),
    ]);
    res.json({
      ok: true,
      adminOnline,
      totalInquiries,
      storage:
        process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
          ? 'supabase'
          : 'local',
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/services', async (_req, res) => {
    const services = await store.getServices();
    res.json({ services });
  });

  router.get('/reviews', async (_req, res) => {
    const reviews = await store.listReviews();
    res.json({ reviews });
  });

  router.post('/reviews', async (req, res) => {
    const ip = getClientIp(req);
    const limit = await enforceRateLimit(store, 'pub_review_create', [ip], 10, 600);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      res.status(429).json({ error: 'Too many reviews submitted. Please wait shortly.' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const err = validateReviewPayload(body);
    if (err) {
      res.status(400).json({ error: err });
      return;
    }

    const author = cleanText(body.author);
    const parts = author.split(/\s+/).filter(Boolean);
    const initials =
      parts.length === 0
        ? 'RJ'
        : parts.length === 1
          ? parts[0]!.slice(0, 2).toUpperCase()
          : `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();

    const rawRole = cleanText(body.role);
    const normalizedRole =
      !rawRole || rawRole === 'Google Signed-In Client' ? 'Verified Customer' : rawRole;
    const review = await store.createReview({
      author,
      initials,
      role: normalizedRole,
      quote: cleanText(body.quote),
      rating: Number(body.rating ?? 5),
      avatarUrl: sanitizeAvatarUrl(body.avatarUrl),
    });

    res.status(201).json({ review });
  });

  router.post('/auth/google', async (req, res) => {
    const ip = getClientIp(req);
    const limit = await enforceRateLimit(store, 'pub_google_auth', [ip], 15, 300);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      res.status(429).json({ error: 'Too many sign-in attempts. Try again shortly.' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const credential = cleanText(body.credential);
    const authCode = cleanText(body.code);
    const configuredClientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const configuredClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

    let googleSub = '';
    let email = '';
    let fullName = '';
    let avatarUrl: string | undefined;

    if (authCode && configuredClientId && configuredClientSecret) {
      try {
        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: authCode,
            client_id: configuredClientId,
            client_secret: configuredClientSecret,
            redirect_uri: cleanText(body.redirectUri) || 'postmessage',
            grant_type: 'authorization_code',
          }),
        });
        if (!tokenResp.ok) {
          res.status(401).json({ error: 'Invalid Google authorization code.' });
          return;
        }
        const tokens = (await tokenResp.json()) as { access_token?: string; id_token?: string };
        if (tokens.access_token) {
          const userResp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (!userResp.ok) {
            res.status(401).json({ error: 'Unable to fetch Google profile.' });
            return;
          }
          const info = (await userResp.json()) as GoogleTokenInfo;
          if (!info.sub || !info.email) {
            res.status(401).json({ error: 'Verified Google email required.' });
            return;
          }
          googleSub = info.sub;
          email = info.email.toLowerCase();
          fullName = info.name?.trim() || email.split('@')[0] || 'Google Customer';
          avatarUrl = info.picture;
        } else if (tokens.id_token) {
          const infoResp = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`,
          );
          if (!infoResp.ok) {
            res.status(401).json({ error: 'Invalid Google token.' });
            return;
          }
          const info = (await infoResp.json()) as GoogleTokenInfo;
          if (!info.sub || !info.email) {
            res.status(401).json({ error: 'Verified Google email required.' });
            return;
          }
          googleSub = info.sub;
          email = info.email.toLowerCase();
          fullName = info.name?.trim() || email.split('@')[0] || 'Google Customer';
          avatarUrl = info.picture;
        } else {
          res.status(401).json({ error: 'Google token exchange failed.' });
          return;
        }
      } catch {
        res.status(502).json({ error: 'Unable to verify Google authorization right now.' });
        return;
      }
    } else if (credential) {
      try {
        const resp = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
        );
        if (!resp.ok) {
          res.status(401).json({ error: 'Invalid Google credential.' });
          return;
        }
        const info = (await resp.json()) as GoogleTokenInfo;
        if (configuredClientId && info.aud !== configuredClientId) {
          res.status(401).json({ error: 'Google token audience mismatch.' });
          return;
        }
        if (!info.sub || !info.email || (info.email_verified !== true && info.email_verified !== 'true')) {
          res.status(401).json({ error: 'Verified Google email required.' });
          return;
        }
        googleSub = info.sub;
        email = info.email.toLowerCase();
        fullName = info.name?.trim() || email.split('@')[0] || 'Google Customer';
        avatarUrl = info.picture;
      } catch {
        res.status(502).json({ error: 'Unable to verify Google token right now.' });
        return;
      }
    } else if (!configuredClientId) {
      // Development fallback only when GOOGLE_CLIENT_ID is not provisioned yet
      const rawName = cleanText(body.fullName) || 'Print HUB Customer';
      const rawEmail =
        cleanText(body.email) ||
        `${rawName.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'customer'}@gmail.com`;
      if (!isValidEmail(rawEmail) || rawName.length < 2) {
        res.status(400).json({ error: 'Valid name and email are required.' });
        return;
      }
      email = rawEmail.toLowerCase();
      fullName = rawName;
      avatarUrl = sanitizeAvatarUrl(body.avatarUrl);
      googleSub = `local-${sha256Hex(email).slice(0, 24)}`;
    } else {
      res.status(400).json({ error: 'Google credential token is required.' });
      return;
    }

    const account = await store.upsertGoogleCustomer({
      googleSub,
      email,
      fullName,
      avatarUrl,
    });

    await store.appendActivityLog({
      actorType: 'customer',
      actorId: account.id,
      actorIdentity: account.email,
      category: 'customer_auth',
      action: 'CUSTOMER_GOOGLE_SIGNIN',
      description: `Customer ${account.fullName} signed in.`,
      targetType: 'customer_account',
      targetId: account.id,
      metadata: { ip },
    });

    res.cookie(CUSTOMER_COOKIE_NAME, randomToken(24), {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({
      customer: {
        id: account.id,
        fullName: account.fullName,
        email: account.email,
        avatarUrl: account.avatarUrl,
      },
    });
  });

  router.post('/auth/profile', async (req, res) => {
    const ip = getClientIp(req);
    const limit = await enforceRateLimit(store, 'pub_profile_update', [ip], 20, 300);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      res.status(429).json({ error: 'Too many profile updates. Wait a moment.' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const avatarUrl = body.avatarUrl === null ? null : (sanitizeAvatarUrl(body.avatarUrl) ?? null);
    await store.updateCustomerAvatar({
      email: cleanText(body.email) || undefined,
      fullName: cleanText(body.fullName) || undefined,
      avatarUrl,
    });
    res.json({ ok: true });
  });

  router.post('/inquiries', async (req, res) => {
    const ip = getClientIp(req);
    const limit = await enforceRateLimit(store, 'pub_inquiry_create', [ip], 8, 600);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      res.status(429).json({ error: 'Too many inquiries submitted. Please wait before sending another.' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const validationErr = validateInquiryPayload(body);
    if (validationErr) {
      res.status(400).json({ error: validationErr });
      return;
    }

    const isBlocked = await store.isCustomerBlocked({
      name: cleanText(body.customerName),
      contact: cleanText(body.contactInfo),
      email: cleanText(body.email) || undefined,
    });
    if (isBlocked) {
      res.status(403).json({ error: 'Unable to submit message at this time.' });
      return;
    }

    const qtyRaw = Number(body.quantity);
    const totalRaw = Number(body.totalPrice);
    const resRaw = body.reservationFee !== undefined && body.reservationFee !== null ? Number(body.reservationFee) : undefined;
    const inquiry = await store.createInquiry({
      customerName: cleanText(body.customerName),
      contactInfo: cleanText(body.contactInfo),
      email: cleanText(body.email) || undefined,
      serviceId: cleanText(body.serviceId),
      message: cleanText(body.message),
      referenceCode: typeof body.referenceCode === 'string' ? cleanText(body.referenceCode) : undefined,
      avatarUrl: sanitizeAvatarUrl(body.avatarUrl),
      quantity: Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.round(qtyRaw) : undefined,
      totalPrice: Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : undefined,
      reservationFee: resRaw !== undefined && Number.isFinite(resRaw) && resRaw >= 0 ? resRaw : undefined,
      wantsReservation: body.wantsReservation === true,
      imageDataUrl: sanitizeAvatarUrl(body.imageDataUrl),
    });

    await store.appendActivityLog({
      actorType: 'customer',
      actorId: inquiry.customerId,
      actorIdentity: inquiry.customerNameSnapshot,
      category: 'inquiries',
      action: 'INQUIRY_CREATED',
      description: `New customer inquiry ${inquiry.referenceCode} (${inquiry.serviceId}).`,
      targetType: 'inquiry',
      targetId: inquiry.id,
      metadata: { referenceCode: inquiry.referenceCode, serviceId: inquiry.serviceId },
    });

    res.status(201).json({ inquiry });
  });

  router.get('/inquiries/by-customer', async (req, res) => {
    const email = cleanText(req.query.email);
    const name = cleanText(req.query.name);
    if (!email && !name) {
      res.json({ inquiry: null });
      return;
    }
    const inquiry = await store.findCustomerInquiry({ email, name });
    const adminOnline = await isAnyAdminOnline(store);
    res.json({
      adminOnline,
      inquiry: inquiry
        ? {
            id: inquiry.id,
            referenceCode: inquiry.referenceCode,
            customerId: inquiry.customerId,
            customerNameSnapshot: inquiry.customerNameSnapshot,
            customerContactSnapshot: inquiry.customerContactSnapshot,
            serviceId: inquiry.serviceId,
            orderItem: inquiry.orderItem,
            message: inquiry.message,
            status: inquiry.status,
            adminSeenAt: inquiry.adminSeenAt ?? null,
            acceptedAt: inquiry.acceptedAt ?? null,
            quantity: inquiry.quantity ?? 1,
            totalPrice: inquiry.totalPrice ?? 0,
            reservationFee: inquiry.reservationFee ?? null,
            submittedAt: inquiry.submittedAt,
            updatedAt: inquiry.updatedAt,
            responses: inquiry.responses,
          }
        : null,
    });
  });

  router.get('/inquiries/by-ref/:ref', async (req, res) => {
    const ref = cleanText(req.params.ref);
    if (!isValidId(ref)) {
      res.status(400).json({ error: 'Invalid inquiry reference.' });
      return;
    }
    const inquiry = await store.getInquiryByRef(ref);
    if (!inquiry) {
      res.status(404).json({ error: 'Inquiry reference not found.' });
      return;
    }
    if (inquiry.isBlocked) {
      res.status(403).json({ error: 'Unable to send message at this time.' });
      return;
    }
    const adminOnline = await isAnyAdminOnline(store);
    res.json({
      adminOnline,
      inquiry: {
        id: inquiry.id,
        referenceCode: inquiry.referenceCode,
        serviceId: inquiry.serviceId,
        orderItem: inquiry.orderItem,
        status: inquiry.status,
        adminSeenAt: inquiry.adminSeenAt ?? null,
        acceptedAt: inquiry.acceptedAt ?? null,
        quantity: inquiry.quantity ?? 1,
        totalPrice: inquiry.totalPrice ?? 0,
        reservationFee: inquiry.reservationFee ?? null,
        updatedAt: inquiry.updatedAt,
        responses: inquiry.responses,
      },
    });
  });

  router.post('/inquiries/by-ref/:ref/messages', async (req, res) => {
    const ip = getClientIp(req);
    const limit = await enforceRateLimit(store, 'pub_inquiry_msg', [ip], 20, 300);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      res.status(429).json({ error: 'Rate limit reached. Please wait a moment.' });
      return;
    }

    const ref = cleanText(req.params.ref);
    if (!isValidId(ref)) {
      res.status(400).json({ error: 'Invalid inquiry reference.' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const err = validateReplyPayload(body);
    if (err) {
      res.status(400).json({ error: err });
      return;
    }

    const inquiry = await store.getInquiryByRef(ref);
    if (!inquiry) {
      res.status(404).json({ error: 'Inquiry reference not found.' });
      return;
    }
    if (inquiry.isBlocked) {
      res.status(403).json({ error: 'Unable to send message at this time.' });
      return;
    }

    const rawServiceNames = Array.isArray(body.serviceNames)
      ? body.serviceNames
          .filter((s): s is string => typeof s === 'string')
          .map((s) => cleanText(s))
          .filter(Boolean)
          .slice(0, 12)
      : undefined;
    const rawQty = Number(body.quantity);
    const saved = await store.addInquiryResponse({
      inquiryId: inquiry.id,
      adminId: null,
      adminDisplayName: cleanText(body.senderName) || inquiry.customerNameSnapshot,
      senderRole: 'customer',
      responseText: cleanText(body.messageText ?? body.responseText),
      imageDataUrl: typeof body.imageDataUrl === 'string' ? body.imageDataUrl : undefined,
      serviceId: typeof body.serviceId === 'string' ? cleanText(body.serviceId) : undefined,
      serviceNames: rawServiceNames,
      quantity: Number.isFinite(rawQty) && rawQty >= 1 ? Math.round(rawQty) : undefined,
    });

    if (!saved) {
      res.status(500).json({ error: 'Unable to save customer message.' });
      return;
    }

    if (body.wantsReservation === true || typeof body.reservationFee === 'number') {
      const feeNum =
        typeof body.reservationFee === 'number' && Number.isFinite(body.reservationFee) && body.reservationFee >= 0
          ? body.reservationFee
          : null;
      await store.setInquiryReservation(inquiry.id, feeNum);
    }

    res.status(201).json(saved);
  });

  return router;
}

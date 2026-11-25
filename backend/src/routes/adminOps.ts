import { Router } from 'express';
import type { BackendStore, ClientOrderStatus, InquiryStatus } from '../db/types.js';
import {
  getClientIp,
  requireAdminSession,
  type AuthenticatedAdminRequest,
} from '../middleware/auth.js';
import {
  cleanText,
  isValidId,
  validateClientPayload,
  validateReplyPayload,
} from '../security/validation.js';

const VALID_STATUSES = new Set<InquiryStatus>(['Pending', 'Answered', 'Completed']);
const VALID_ORDER_STATUSES = new Set<ClientOrderStatus>(['Pending', 'Done', 'Cancelled']);

function isInquiryUnreadByAdmin(inq: {
  submittedAt: string;
  adminSeenAt?: string | null;
  archivedToHistory?: boolean;
  responses: Array<{ senderRole: 'admin' | 'customer'; respondedAt: string }>;
}): boolean {
  if (inq.archivedToHistory) return false;
  const lastAdminReply = [...inq.responses].reverse().find((r) => r.senderRole === 'admin');
  const lastCustMsg = [...inq.responses].reverse().find((r) => r.senderRole === 'customer');
  const latestCustMs = new Date(lastCustMsg ? lastCustMsg.respondedAt : inq.submittedAt).getTime();
  if (lastAdminReply && new Date(lastAdminReply.respondedAt).getTime() >= latestCustMs) return false;
  if (inq.adminSeenAt && new Date(inq.adminSeenAt).getTime() >= latestCustMs) return false;
  return true;
}

function buildChartSeries(
  inquiries: Array<{
    submittedAt: string;
    customerId: string | null;
    status: InquiryStatus;
    updatedAt: string;
  }>,
  clients: Array<{
    id: string;
    orderStatus?: ClientOrderStatus;
    statusUpdatedAt?: string;
    createdAt?: string;
    updatedAt: string;
  }>,
) {
  const now = new Date();
  const resolvedDates = clients
    .filter((c) => c.orderStatus === 'Done' || c.orderStatus === 'Cancelled')
    .map((c) => c.statusUpdatedAt ?? c.updatedAt);

  const countInRange = (dates: string[], startMs: number, endMs: number) =>
    dates.filter((iso) => {
      const t = new Date(iso).getTime();
      return t >= startMs && t < endMs;
    }).length;

  const linkedClientIds = new Set(
    inquiries.map((i) => i.customerId).filter((id): id is string => Boolean(id)),
  );
  const incomingDates = [
    ...inquiries.map((i) => i.submittedAt),
    ...clients
      .filter((c) => !linkedClientIds.has(c.id))
      .map((c) => c.createdAt ?? c.updatedAt),
  ];

  const daily: Array<{ label: string; incoming: number; resolved: number }> = [];
  for (let i = 6; i >= 0; i -= 1) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dayEnd = new Date(dayStart.getTime() + 86400_000);
    daily.push({
      label: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      incoming: countInRange(incomingDates, dayStart.getTime(), dayEnd.getTime()),
      resolved: countInRange(resolvedDates, dayStart.getTime(), dayEnd.getTime()),
    });
  }

  const weekly: Array<{ label: string; incoming: number; resolved: number }> = [];
  for (let w = 3; w >= 0; w -= 1) {
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    const endMs = todayEnd - w * 7 * 86400_000;
    const startMs = endMs - 7 * 86400_000;
    weekly.push({
      label: `Week ${4 - w}`,
      incoming: countInRange(incomingDates, startMs, endMs),
      resolved: countInRange(resolvedDates, startMs, endMs),
    });
  }

  const monthly: Array<{ label: string; incoming: number; resolved: number }> = [];
  for (let m = 5; m >= 0; m -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
    monthly.push({
      label: start.toLocaleDateString('en-US', { month: 'short' }),
      incoming: countInRange(incomingDates, start.getTime(), end.getTime()),
      resolved: countInRange(resolvedDates, start.getTime(), end.getTime()),
    });
  }

  return { daily, weekly, monthly };
}

function extractPersonTokens(name?: string, email?: string, contact?: string): string[] {
  const tokens: string[] = [];
  const normName = (name || '').trim().toLowerCase();
  if (normName) tokens.push(`name:${normName}`);
  const normEmail = (
    email ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(contact || '')?.[0] ||
    ''
  )
    .replace(/google\.customer@gmail\.com/gi, 'googlecustomer@gmail.com')
    .trim()
    .toLowerCase();
  if (normEmail) tokens.push(`email:${normEmail}`);
  const digits = (contact || '').replace(/[\s()-]/g, '');
  const phoneMatch = /0\d{9,10}/.exec(digits);
  if (phoneMatch?.[0]) tokens.push(`phone:${phoneMatch[0]}`);
  return tokens;
}

function countUniquePeople(
  inquiries: Array<{ customerNameSnapshot: string; customerEmail?: string; customerContactSnapshot: string }>,
  clients: Array<{ fullName: string; contactInfo: string }>,
): number {
  const tokenSets = [
    ...inquiries.map((i) =>
      extractPersonTokens(i.customerNameSnapshot, i.customerEmail, i.customerContactSnapshot),
    ),
    ...clients.map((c) => extractPersonTokens(c.fullName, undefined, c.contactInfo)),
  ].filter((t) => t.length > 0);

  const parent = tokenSets.map((_, idx) => idx);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const firstOwner = new Map<string, number>();
  tokenSets.forEach((tokens, idx) => {
    for (const tok of tokens) {
      const owner = firstOwner.get(tok);
      if (owner !== undefined) {
        union(owner, idx);
      } else {
        firstOwner.set(tok, idx);
      }
    }
  });

  const roots = new Set<number>();
  for (let i = 0; i < tokenSets.length; i += 1) {
    roots.add(find(i));
  }
  return roots.size;
}

export function createAdminOpsRouter(store: BackendStore): Router {
  const router = Router();
  router.use(requireAdminSession(store, { minStage: 'mfa_verified' }));

  // Dashboard Summary + Real-Data Charts
  router.get('/dashboard', async (_req, res) => {
    const inquiries = await store.listInquiries();
    const clients = await store.listClients();
    const services = await store.getServices();
    const activities = await store.listActivityLogs({ page: 1, pageSize: 8 });
    const secLogs = await store.listSecurityLogs({ page: 1, pageSize: 5 });

    let pending = 0;
    let answered = 0;
    const linkedClientIds = new Set(
      inquiries.map((i) => i.customerId).filter((id): id is string => Boolean(id)),
    );
    for (const inq of inquiries) {
      if (inq.status === 'Pending') pending += 1;
      else if (inq.status === 'Answered') answered += 1;
    }
    for (const client of clients) {
      if (!linkedClientIds.has(client.id) && (client.orderStatus ?? 'Pending') === 'Pending') {
        pending += 1;
      }
    }
    const completed = clients.filter((c) => c.orderStatus === 'Done').length;

    const chartSeries = buildChartSeries(inquiries, clients);
    const dailyVolume = chartSeries.daily.map((d) => ({
      date: d.label,
      label: d.label,
      count: d.incoming,
    }));

    const serviceCounts = services.map((s) => ({
      serviceId: s.id,
      serviceName: s.serviceName,
      count: inquiries.filter((i) => i.serviceId === s.id).length,
    }));

    const uniqueTotal = countUniquePeople(inquiries, clients);
    const unreadInquiries = inquiries.filter(isInquiryUnreadByAdmin);

    res.json({
      counts: {
        total: uniqueTotal,
        pending,
        answered,
        completed,
        clients: clients.length,
      },
      dailyVolume,
      chartSeries,
      serviceDemand: serviceCounts,
      recentInquiries: unreadInquiries.slice(0, 8),
      recentActivities: activities.items,
      recentSecurityAlerts: secLogs.items,
    });
  });

  // Message Management (CRM)
  router.get('/inquiries', async (req, res) => {
    const search = cleanText(req.query.search);
    const statusRaw = cleanText(req.query.status);
    const folder = cleanText(req.query.folder);
    const status =
      statusRaw === 'Pending' || statusRaw === 'Answered' || statusRaw === 'Completed'
        ? statusRaw
        : 'All';
    let inquiries = await store.listInquiries({ search, status });
    if (folder === 'active') {
      inquiries = inquiries.filter((i) => !i.archivedToHistory);
    } else if (folder === 'history') {
      inquiries = inquiries.filter(
        (i) =>
          Boolean(i.archivedToHistory) ||
          Boolean(i.acceptedAt) ||
          i.responses.some((r) => r.senderRole === 'admin'),
      );
    }
    res.json({ inquiries });
  });

  router.delete(
    '/inquiries/history/all',
    requireAdminSession(store, {
      minStage: 'mfa_verified',
      allowedRoles: ['owner', 'admin'],
      requireReauthMinutes: 5,
    }),
    async (req: AuthenticatedAdminRequest, res) => {
      const outcome = await store.deleteAllMessageHistory();
      await store.appendActivityLog({
        actorType: 'admin',
        actorId: req.admin!.id,
        actorIdentity: req.admin!.email,
        category: 'inquiries',
        action: 'MESSAGE_HISTORY_CLEARED',
        description: `Deleted ${outcome.deletedCount} inquiry thread(s) from Message History.`,
        targetType: 'inquiry',
        targetId: null,
        metadata: outcome,
      });
      res.json(outcome);
    },
  );

  router.get('/inquiries/:id', async (req, res) => {
    const id = cleanText(req.params.id);
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid inquiry identifier.' });
      return;
    }
    const inquiry = await store.getInquiryById(id);
    if (!inquiry) {
      res.status(404).json({ error: 'Inquiry not found.' });
      return;
    }
    const relatedInquiries = inquiry.customerId
      ? (await store.getClientInquiries(inquiry.customerId)).filter((i) => i.id !== inquiry.id)
      : [];
    const client = inquiry.customerId ? await store.getClientById(inquiry.customerId) : null;
    res.json({ inquiry, client, relatedInquiries });
  });

  router.post('/inquiries/:id/seen', async (req, res) => {
    const id = cleanText(req.params.id);
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid inquiry identifier.' });
      return;
    }
    const updated = await store.markInquirySeen(id);
    if (!updated) {
      res.status(404).json({ error: 'Inquiry not found.' });
      return;
    }
    res.json({ inquiry: updated });
  });

  router.post('/inquiries/:id/accept', async (req: AuthenticatedAdminRequest, res) => {
    const id = cleanText(req.params.id);
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid inquiry identifier.' });
      return;
    }
    const outcome = await store.acceptInquiry(id);
    if (!outcome) {
      res.status(404).json({ error: 'Inquiry not found.' });
      return;
    }
    await store.appendActivityLog({
      actorType: 'admin',
      actorId: req.admin!.id,
      actorIdentity: req.admin!.email,
      category: 'inquiries',
      action: 'INQUIRY_ACCEPTED',
      description: `Accepted inquiry ${outcome.inquiry.referenceCode} into Client Records.`,
      targetType: 'inquiry',
      targetId: outcome.inquiry.id,
      metadata: { referenceCode: outcome.inquiry.referenceCode },
    });
    res.json(outcome);
  });

  router.post('/inquiries/:id/decline', async (req: AuthenticatedAdminRequest, res) => {
    const id = cleanText(req.params.id);
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid inquiry identifier.' });
      return;
    }
    const updated = await store.archiveInquiryToHistory(id);
    if (!updated) {
      res.status(404).json({ error: 'Inquiry not found.' });
      return;
    }
    await store.appendActivityLog({
      actorType: 'admin',
      actorId: req.admin!.id,
      actorIdentity: req.admin!.email,
      category: 'inquiries',
      action: 'INQUIRY_ARCHIVED_HISTORY',
      description: `Moved ${updated.referenceCode} to Message History.`,
      targetType: 'inquiry',
      targetId: updated.id,
      metadata: { referenceCode: updated.referenceCode },
    });
    res.json({ inquiry: updated });
  });

  router.patch('/inquiries/:id/status', async (req: AuthenticatedAdminRequest, res) => {
    const id = cleanText(req.params.id);
    const status = cleanText((req.body as Record<string, unknown>)?.status) as InquiryStatus;
    if (!isValidId(id) || !VALID_STATUSES.has(status)) {
      res.status(400).json({ error: 'Valid inquiry ID and status are required.' });
      return;
    }

    const updated = await store.updateInquiryStatus(id, status);
    if (!updated) {
      res.status(404).json({ error: 'Inquiry not found.' });
      return;
    }

    await store.appendActivityLog({
      actorType: 'admin',
      actorId: req.admin!.id,
      actorIdentity: req.admin!.email,
      category: 'inquiries',
      action: 'INQUIRY_STATUS_UPDATED',
      description: `Changed ${updated.referenceCode} status to ${status}.`,
      targetType: 'inquiry',
      targetId: updated.id,
      metadata: { referenceCode: updated.referenceCode, status },
    });

    res.json({ inquiry: updated });
  });

  router.post('/inquiries/:id/responses', async (req: AuthenticatedAdminRequest, res) => {
    const id = cleanText(req.params.id);
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid inquiry identifier.' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const err = validateReplyPayload(body);
    if (err) {
      res.status(400).json({ error: err });
      return;
    }
    const nextStatusRaw = cleanText(body.nextStatus) as InquiryStatus;
    const nextStatus = VALID_STATUSES.has(nextStatusRaw) ? nextStatusRaw : undefined;

    const saved = await store.addInquiryResponse({
      inquiryId: id,
      adminId: req.admin!.id,
      adminDisplayName: req.admin!.displayName,
      senderRole: 'admin',
      responseText: cleanText(body.responseText),
      imageDataUrl: typeof body.imageDataUrl === 'string' ? body.imageDataUrl : undefined,
      nextStatus,
    });
    if (!saved) {
      res.status(404).json({ error: 'Inquiry not found.' });
      return;
    }

    await store.appendActivityLog({
      actorType: 'admin',
      actorId: req.admin!.id,
      actorIdentity: req.admin!.email,
      category: 'messaging',
      action: 'ADMIN_REPLY_SENT',
      description: `Sent reply on ${saved.inquiry.referenceCode}.`,
      targetType: 'inquiry',
      targetId: saved.inquiry.id,
      metadata: { referenceCode: saved.inquiry.referenceCode, status: saved.inquiry.status },
    });

    res.status(201).json(saved);
  });

  // Client Records Management (sorted, paginated, role + reauth guarded delete)
  router.get('/clients', async (req, res) => {
    const search = cleanText(req.query.search);
    const scope = cleanText(req.query.scope);
    const dateFilter = cleanText(req.query.date);
    const fromTime = cleanText(req.query.fromTime);
    const toTime = cleanText(req.query.toTime);
    const timeQuery = cleanText(req.query.timeQuery).toLowerCase();
    const sort = cleanText(req.query.sort) || 'newest';
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 12) || 12));

    let items = await store.listClients(scope === 'logs' ? '' : search);
    if (scope === 'pending') {
      items = items.filter((c) => (c.orderStatus ?? 'Pending') === 'Pending');
    } else if (scope === 'logs') {
      items = items.filter((c) => c.orderStatus === 'Done' || c.orderStatus === 'Cancelled');
    }

    if (dateFilter || fromTime || toTime || timeQuery) {
      items = items.filter((c) => {
        const tsIso = c.statusUpdatedAt ?? c.updatedAt;
        const d = new Date(tsIso);
        const localDate = Number.isNaN(d.getTime())
          ? tsIso.slice(0, 10)
          : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const hhmm = Number.isNaN(d.getTime()) ? tsIso.slice(11, 16) : d.toTimeString().slice(0, 5);
        const formatted = Number.isNaN(d.getTime())
          ? tsIso
          : d
              .toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })
              .toLowerCase();

        if (dateFilter && localDate !== dateFilter && (c.orderDate ?? '') !== dateFilter) {
          return false;
        }
        if (fromTime && hhmm < fromTime) return false;
        if (toTime && hhmm > toTime) return false;
        if (
          timeQuery &&
          !localDate.includes(timeQuery) &&
          !(c.orderDate ?? '').toLowerCase().includes(timeQuery) &&
          !hhmm.includes(timeQuery) &&
          !formatted.includes(timeQuery)
        ) {
          return false;
        }
        return true;
      });
    }

    if (sort === 'name') {
      items = [...items].sort((a, b) => a.fullName.localeCompare(b.fullName));
    } else if (sort === 'oldest' || sort === 'date_asc') {
      items = [...items].sort(
        (a, b) =>
          new Date(a.statusUpdatedAt ?? a.updatedAt).getTime() -
          new Date(b.statusUpdatedAt ?? b.updatedAt).getTime(),
      );
    } else if (sort === 'date_desc') {
      items = [...items].sort(
        (a, b) =>
          new Date(b.statusUpdatedAt ?? b.updatedAt).getTime() -
          new Date(a.statusUpdatedAt ?? a.updatedAt).getTime(),
      );
    } else if (sort === 'time_asc' || sort === 'time_desc') {
      const toMinutes = (iso: string) => {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? 0 : d.getHours() * 60 + d.getMinutes();
      };
      items = [...items].sort((a, b) => {
        const diff =
          toMinutes(a.statusUpdatedAt ?? a.updatedAt) -
          toMinutes(b.statusUpdatedAt ?? b.updatedAt);
        return sort === 'time_asc' ? diff : -diff;
      });
    }

    const total = items.length;
    const sliced = items.slice((page - 1) * pageSize, page * pageSize);
    const withCounts = await Promise.all(
      sliced.map(async (c) => {
        const linked = await store.getClientInquiries(c.id);
        return { ...c, inquiryCount: linked.length };
      }),
    );

    res.json({ clients: withCounts, total, page, pageSize });
  });

  router.get('/clients/:id', async (req, res) => {
    const id = cleanText(req.params.id);
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid client ID.' });
      return;
    }
    const client = await store.getClientById(id);
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    const inquiries = await store.getClientInquiries(id);
    res.json({ client, inquiries });
  });

  router.post('/clients', async (req: AuthenticatedAdminRequest, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const err = validateClientPayload(body);
    if (err) {
      res.status(400).json({ error: err });
      return;
    }
    const orderStatusRaw = cleanText(body.orderStatus) as ClientOrderStatus;
    const qtyRaw = Number(body.quantity ?? 1);
    const totalRaw = Number(body.totalPrice ?? 0);
    const resFeeRaw =
      body.reservationFee === null || body.reservationFee === undefined || body.reservationFee === ''
        ? null
        : Number(body.reservationFee);
    const created = await store.createClient({
      fullName: cleanText(body.fullName),
      contactInfo: cleanText(body.contactInfo),
      notes: cleanText(body.notes),
      orderItem: cleanText(body.orderItem),
      quantity: Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.round(qtyRaw) : 1,
      totalPrice: Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : 0,
      reservationFee:
        resFeeRaw !== null && Number.isFinite(resFeeRaw) && resFeeRaw >= 0 ? resFeeRaw : null,
      orderDate: cleanText(body.orderDate) || undefined,
      orderStatus: VALID_ORDER_STATUSES.has(orderStatusRaw) ? orderStatusRaw : 'Pending',
    });
    await store.appendActivityLog({
      actorType: 'admin',
      actorId: req.admin!.id,
      actorIdentity: req.admin!.email,
      category: 'clients',
      action: 'CLIENT_CREATED',
      description: `Created client record for ${created.fullName}.`,
      targetType: 'client',
      targetId: created.id,
      metadata: {},
    });
    res.status(201).json({ client: created });
  });

  router.patch('/clients/:id', async (req: AuthenticatedAdminRequest, res) => {
    const id = cleanText(req.params.id);
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid client ID.' });
      return;
    }
    const existing = await store.getClientById(id);
    if (!existing) {
      res.status(404).json({ error: 'Client record not found.' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const normalizedBody = {
      ...body,
      fullName: cleanText(body.fullName) || existing.fullName,
      contactInfo:
        body.contactInfo !== undefined ? cleanText(body.contactInfo) : existing.contactInfo,
      notes: body.notes !== undefined ? cleanText(body.notes) : existing.notes,
    };
    const err = validateClientPayload(normalizedBody);
    if (err) {
      res.status(400).json({ error: err });
      return;
    }
    const orderStatusRaw = cleanText(body.orderStatus) as ClientOrderStatus;
    const qtyRaw = body.quantity !== undefined ? Number(body.quantity) : undefined;
    const totalRaw = body.totalPrice !== undefined ? Number(body.totalPrice) : undefined;
    const resFeeVal =
      body.reservationFee === undefined
        ? undefined
        : body.reservationFee === null || body.reservationFee === ''
          ? null
          : Number(body.reservationFee);
    const updated = await store.updateClient(id, {
      fullName: normalizedBody.fullName,
      contactInfo: normalizedBody.contactInfo,
      notes: normalizedBody.notes,
      ...(body.orderItem !== undefined ? { orderItem: cleanText(body.orderItem) } : {}),
      ...(qtyRaw !== undefined && Number.isFinite(qtyRaw) && qtyRaw >= 1 ? { quantity: Math.round(qtyRaw) } : {}),
      ...(totalRaw !== undefined && Number.isFinite(totalRaw) && totalRaw >= 0 ? { totalPrice: totalRaw } : {}),
      ...(resFeeVal !== undefined
        ? {
            reservationFee:
              resFeeVal !== null && Number.isFinite(resFeeVal) && resFeeVal >= 0 ? resFeeVal : null,
          }
        : {}),
      ...(body.orderDate !== undefined ? { orderDate: cleanText(body.orderDate) } : {}),
      ...(VALID_ORDER_STATUSES.has(orderStatusRaw) ? { orderStatus: orderStatusRaw } : {}),
    });
    if (!updated) {
      res.status(404).json({ error: 'Client record not found.' });
      return;
    }
    await store.appendActivityLog({
      actorType: 'admin',
      actorId: req.admin!.id,
      actorIdentity: req.admin!.email,
      category: 'clients',
      action: 'CLIENT_UPDATED',
      description: `Updated client record ${updated.fullName}.`,
      targetType: 'client',
      targetId: updated.id,
      metadata: { orderStatus: updated.orderStatus },
    });
    res.json({ client: updated });
  });

  router.delete(
    '/clients/logs/all',
    requireAdminSession(store, {
      minStage: 'mfa_verified',
      allowedRoles: ['owner', 'admin'],
      requireReauthMinutes: 5,
    }),
    async (req: AuthenticatedAdminRequest, res) => {
      const outcome = await store.deleteAllLogClients();
      await store.appendActivityLog({
        actorType: 'admin',
        actorId: req.admin!.id,
        actorIdentity: req.admin!.email,
        category: 'clients',
        action: 'CLIENT_LOGS_CLEARED',
        description: `Deleted ${outcome.deletedCount} completed/cancelled client log(s); preserved ${outcome.archivedInquiryCount} linked message threads.`,
        targetType: 'client',
        targetId: null,
        metadata: outcome,
      });
      res.json(outcome);
    },
  );

  router.delete(
    '/clients/:id',
    requireAdminSession(store, {
      minStage: 'mfa_verified',
      allowedRoles: ['owner', 'admin'],
      requireReauthMinutes: 5,
    }),
    async (req: AuthenticatedAdminRequest, res) => {
      const id = cleanText(req.params.id);
      if (!isValidId(id)) {
        res.status(400).json({ error: 'Invalid client ID.' });
        return;
      }
      const outcome = await store.deleteClient(id);
      if (!outcome) {
        res.status(404).json({ error: 'Client record not found.' });
        return;
      }
      await store.appendActivityLog({
        actorType: 'admin',
        actorId: req.admin!.id,
        actorIdentity: req.admin!.email,
        category: 'clients',
        action: 'CLIENT_DELETED',
        description: `Deleted client ${id}; anonymized ${outcome.archivedInquiryCount} linked inquiries.`,
        targetType: 'client',
        targetId: id,
        metadata: { archivedInquiryCount: outcome.archivedInquiryCount },
      });
      res.json(outcome);
    },
  );

  // Immutable Activity & Security Logs (Read-only endpoints)
  router.get('/logs/activity', async (req, res) => {
    const result = await store.listActivityLogs({
      search: cleanText(req.query.search),
      category: cleanText(req.query.category),
      from: cleanText(req.query.from),
      to: cleanText(req.query.to),
      page: Number(req.query.page ?? 1) || 1,
      pageSize: Number(req.query.pageSize ?? 20) || 20,
    });
    res.json(result);
  });

  router.get('/logs/security', async (req, res) => {
    const result = await store.listSecurityLogs({
      search: cleanText(req.query.search),
      severity: cleanText(req.query.severity),
      from: cleanText(req.query.from),
      to: cleanText(req.query.to),
      page: Number(req.query.page ?? 1) || 1,
      pageSize: Number(req.query.pageSize ?? 20) || 20,
    });
    res.json(result);
  });

  // Active Sessions Monitoring & Revocation
  router.get('/sessions', async (req: AuthenticatedAdminRequest, res) => {
    const sessions = await store.listAdminSessions(
      req.admin!.role === 'owner' ? undefined : req.admin!.id,
    );
    const active = sessions
      .filter((s) => !s.revokedAt && new Date(s.expiresAt).getTime() > Date.now())
      .map((s) => ({
        id: s.id,
        adminId: s.adminId,
        authStage: s.authStage,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        lastActiveAt: s.lastActiveAt,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
        isCurrent: s.id === req.adminSession!.id,
      }));
    res.json({ sessions: active });
  });

  router.delete('/sessions/others', async (req: AuthenticatedAdminRequest, res) => {
    const count = await store.revokeAllOtherSessions(req.admin!.id, req.adminSession!.id);
    await store.appendSecurityLog({
      eventType: 'OTHER_SESSIONS_REVOKED',
      severity: 'info',
      actorIdentity: req.admin!.email,
      ipAddress: getClientIp(req),
      description: `Revoked ${count} other active session(s).`,
      targetId: req.admin!.id,
      details: { count },
    });
    res.json({ revokedCount: count });
  });

  router.delete('/sessions/:id', async (req: AuthenticatedAdminRequest, res) => {
    const id = cleanText(req.params.id);
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid session ID.' });
      return;
    }
    const all = await store.listAdminSessions(req.admin!.role === 'owner' ? undefined : req.admin!.id);
    const target = all.find((s) => s.id === id);
    if (!target) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    await store.revokeSession(id);
    await store.appendSecurityLog({
      eventType: 'SESSION_REVOKED',
      severity: 'info',
      actorIdentity: req.admin!.email,
      ipAddress: getClientIp(req),
      description: `Revoked session ${id}.`,
      targetId: id,
      details: {},
    });
    res.json({ revoked: true });
  });

  return router;
}

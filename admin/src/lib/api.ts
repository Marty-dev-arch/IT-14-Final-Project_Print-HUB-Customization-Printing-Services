const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

function readCookie(name: string): string {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return '';
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(status: number, message: string, data: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCookie('rjhub_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    throw new ApiError(
      res.status,
      typeof parsed.error === 'string' ? parsed.error : `Request failed (${res.status})`,
      parsed,
    );
  }
  return parsed as T;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const SERVICE_NAMES: Record<string, string> = {
  lamination: 'Lamination',
  'souvenir-making': 'Souvenir Making',
  'document-printing': 'Document Printing',
  'sintra-board': 'Sintra Board',
  'laser-engraving': 'Laser Engraving',
  'mug-customization': 'Mug Customization',
  'custom-keychains': 'Custom Keychains',
  'a4-calendar': 'A4 Calendar',
  'refrigerator-magnets': 'Refrigerator Magnets',
  'General Inquiry': 'General Inquiry',
};

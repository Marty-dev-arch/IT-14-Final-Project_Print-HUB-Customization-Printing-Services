import type { BackendStore } from '../db/types.js';
import { sha256Hex } from './crypto.js';

export interface RateLimitCheck {
  allowed: boolean;
  retryAfterSec: number;
  count: number;
}

export async function enforceRateLimit(
  store: BackendStore,
  scope: string,
  parts: string[],
  maxAttempts: number,
  windowSeconds: number,
): Promise<RateLimitCheck> {
  const key = `${scope}:${parts.map((p) => sha256Hex(p.toLowerCase()).slice(0, 16)).join(':')}`;
  const res = await store.incrementRateLimit(key, windowSeconds);
  const retryAfterSec = Math.max(1, Math.ceil((new Date(res.resetAt).getTime() - Date.now()) / 1000));
  return {
    allowed: res.count <= maxAttempts,
    retryAfterSec,
    count: res.count,
  };
}

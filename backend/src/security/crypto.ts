import crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ARGON2_PARAMS = {
  parallelism: 1,
  tagLength: 32,
  memory: 65536,
  passes: 3,
} as const;

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

interface Argon2Options {
  message: Buffer;
  nonce: Buffer;
  parallelism: number;
  tagLength: number;
  memory: number;
  passes: number;
}

const nativeArgon2Sync = (
  crypto as unknown as {
    argon2Sync: (algo: 'argon2id', opts: Argon2Options) => Buffer;
  }
).argon2Sync;

export function hashArgon2(plain: string): string {
  const salt = crypto.randomBytes(16);
  const derived = nativeArgon2Sync('argon2id', {
    message: Buffer.from(plain, 'utf8'),
    nonce: salt,
    ...ARGON2_PARAMS,
  });
  return `$argon2id$v=19$m=${ARGON2_PARAMS.memory},t=${ARGON2_PARAMS.passes},p=${ARGON2_PARAMS.parallelism}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export function verifyArgon2(plain: string, encoded: string): boolean {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[1] !== 'argon2id') return false;
  const paramStr = parts[3] ?? '';
  const saltB64 = parts[4] ?? '';
  const expectedB64 = parts[5] ?? '';
  const mMatch = /m=(\d+)/.exec(paramStr);
  const tMatch = /t=(\d+)/.exec(paramStr);
  const pMatch = /p=(\d+)/.exec(paramStr);
  if (!mMatch || !tMatch || !pMatch) return false;

  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(expectedB64, 'base64');
    const derived = nativeArgon2Sync('argon2id', {
      message: Buffer.from(plain, 'utf8'),
      nonce: salt,
      memory: Number(mMatch[1]),
      passes: Number(tMatch[1]),
      parallelism: Number(pMatch[1]),
      tagLength: expected.length,
    });
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function getAesKey(): Buffer {
  const raw =
    process.env.TOTP_ENCRYPTION_KEY?.trim() || 'dev-local-only-32-byte-secret-key!';
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getAesKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(payload: string): string {
  const [ivStr, tagStr, dataStr] = payload.split('.');
  if (!ivStr || !tagStr || !dataStr) {
    throw new Error('Malformed encrypted secret.');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getAesKey(),
    Buffer.from(ivStr, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagStr, 'base64url'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataStr, 'base64url')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

function encodeBase32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

function decodeBase32(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return encodeBase32(crypto.randomBytes(20));
}

export function generateTotpCode(secretBase32: string, step: number): string {
  const key = decodeBase32(secretBase32);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const codeInt =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);
  return String(codeInt % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(
  secretBase32: string,
  submittedCode: string,
  lastAcceptedStep?: number | null,
  nowMs = Date.now(),
): { valid: boolean; step: number } {
  const normalized = submittedCode.trim();
  if (!/^\d{6}$/.test(normalized)) {
    return { valid: false, step: 0 };
  }
  const currentStep = Math.floor(nowMs / 1000 / 30);
  for (const delta of [-1, 0, 1]) {
    const candidateStep = currentStep + delta;
    if (lastAcceptedStep !== undefined && lastAcceptedStep !== null && candidateStep <= lastAcceptedStep) {
      continue;
    }
    const expected = generateTotpCode(secretBase32, candidateStep);
    if (timingSafeEqualStr(normalized, expected)) {
      return { valid: true, step: candidateStep };
    }
  }
  return { valid: false, step: 0 };
}

export function buildOtpAuthUri(email: string, secretBase32: string): string {
  const issuer = encodeURIComponent('RJ HUB Printing Admin');
  const label = encodeURIComponent(email);
  return `otpauth://totp/${issuer}:${label}?secret=${secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export function generateRecoveryCodes(count = 8): { plain: string[]; hashes: string[] } {
  const plain: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const code = `${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    plain.push(code);
    hashes.push(hashArgon2(code));
  }
  return { plain, hashes };
}

const SENSITIVE_KEY_RE = /password|pin|secret|token|cookie|authorization|hash|credential/i;

export function redactSecrets(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactSecrets(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

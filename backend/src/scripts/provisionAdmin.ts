import { createStore } from '../db/store.js';
import {
  buildOtpAuthUri,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashArgon2,
} from '../security/crypto.js';
import { validateAdminPassword, validatePinFormat } from '../security/validation.js';

/**
 * CLI script to provision an Administrator account securely (no public signup).
 * Usage:
 *   ADMIN_EMAIL=owner@rjhubprinting.com ADMIN_NAME="RJ Owner" ADMIN_PASSWORD="Strong@Password123!" ADMIN_PIN=246810 npm run provision-admin
 */
async function main() {
  const email = (process.env.ADMIN_EMAIL || 'owner@rjhubprinting.com').trim().toLowerCase();
  const displayName = (process.env.ADMIN_NAME || 'RJ HUB Owner').trim();
  const password = process.env.ADMIN_PASSWORD || '';
  const pin = process.env.ADMIN_PIN || '';
  const role = (process.env.ADMIN_ROLE as 'owner' | 'admin' | 'staff') || 'owner';

  const pwErr = validateAdminPassword(password);
  if (pwErr) {
    console.error(`ADMIN_PASSWORD error: ${pwErr}`);
    process.exit(1);
  }
  const pinErr = validatePinFormat(pin);
  if (pinErr) {
    console.error(`ADMIN_PIN error: ${pinErr}`);
    process.exit(1);
  }

  const store = createStore();
  const totpSecret = generateTotpSecret();
  const { plain: recoveryCodes, hashes: recoveryCodeHashes } = generateRecoveryCodes(8);

  const admin = await store.upsertProvisionedAdmin({
    email,
    displayName,
    role,
    passwordHash: hashArgon2(password),
    pinHash: hashArgon2(pin),
    totpSecretEncrypted: encryptSecret(totpSecret),
    mfaEnabled: true,
    recoveryCodeHashes,
    lastTotpStep: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    lastLoginAt: null,
  });

  console.log('\nProvisioned RJ HUB Administrator successfully:');
  console.log(`  ID:     ${admin.id}`);
  console.log(`  Email:  ${admin.email}`);
  console.log(`  Role:   ${admin.role}`);
  console.log(`  TOTP:   ${totpSecret}`);
  console.log(`  URI:    ${buildOtpAuthUri(admin.email, totpSecret)}`);
  console.log(`  Codes:  ${recoveryCodes.join(', ')}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { useState, type FormEvent } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { apiRequest } from '../lib/api';

export function SettingsPage() {
  const { admin, refreshSession } = useAdminAuth();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [pinErr, setPinErr] = useState<string | null>(null);

  const [enrollData, setEnrollData] = useState<{
    secret: string;
    otpauthUri: string;
    recoveryCodes: string[];
  } | null>(null);
  const [totpConfirm, setTotpConfirm] = useState('');
  const [mfaMsg, setMfaMsg] = useState<string | null>(null);

  async function handlePinRotate(e: FormEvent) {
    e.preventDefault();
    setPinErr(null);
    setPinMsg(null);
    try {
      await apiRequest('/api/admin/auth/pin', {
        method: 'PATCH',
        body: { currentPin, newPin },
      });
      setCurrentPin('');
      setNewPin('');
      setPinMsg('Security PIN updated cleanly with Argon2id.');
    } catch (err) {
      setPinErr(err instanceof Error ? err.message : 'Unable to update PIN.');
    }
  }

  async function startMfaEnroll() {
    const res = await apiRequest<{
      secret: string;
      otpauthUri: string;
      recoveryCodes: string[];
    }>('/api/admin/auth/mfa/enroll', { method: 'POST', body: { action: 'begin' } });
    setEnrollData(res);
    setMfaMsg(null);
  }

  async function confirmMfaEnroll(e: FormEvent) {
    e.preventDefault();
    await apiRequest('/api/admin/auth/mfa/enroll', {
      method: 'POST',
      body: { action: 'confirm', code: totpConfirm },
    });
    setEnrollData(null);
    setTotpConfirm('');
    setMfaMsg('TOTP Authenticator MFA is active on your administrator account.');
    await refreshSession();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[#151515]">Security Settings</h1>

      <section className="rounded-2xl border border-[#EAEAEA] bg-white p-6 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-[#151515]" />
          <h2 className="text-base font-semibold text-[#151515]">Rotate 6-Digit Security PIN</h2>
        </div>
        {pinErr && <p className="text-xs font-medium text-[#C8004B]">{pinErr}</p>}
        {pinMsg && <p className="text-xs font-semibold text-[#4A8008]">{pinMsg}</p>}
        <form onSubmit={handlePinRotate} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-[#151515]">Current PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              required
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="font-mono-code mt-1 h-10 w-full rounded-lg border border-[#DCDCDC] px-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#151515]">New 6-Digit PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              required
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="font-mono-code mt-1 h-10 w-full rounded-lg border border-[#DCDCDC] px-3 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-admin-green">
              Update PIN
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-[#EAEAEA] bg-white p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#151515]" />
            <h2 className="text-base font-semibold text-[#151515]">TOTP Multi-Factor Authentication</h2>
          </div>
          <span className="rounded-full border-2 border-[#8FE515] bg-[#F4FCE6] px-2.5 py-0.5 text-xs font-semibold text-[#151515]">
            {admin?.mfaEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {mfaMsg && <p className="text-xs font-semibold text-[#4A8008]">{mfaMsg}</p>}

        {!enrollData ? (
          <button type="button" onClick={() => void startMfaEnroll()} className="btn-admin-green">
            {admin?.mfaEnabled ? 'Rotate Authenticator Secret & Recovery Codes' : 'Setup Authenticator App'}
          </button>
        ) : (
          <form onSubmit={confirmMfaEnroll} className="space-y-4 rounded-xl border border-[#EAEAEA] bg-[#FAFAFA] p-4">
            <p className="text-xs text-[#676767]">
              Add this secret key to Google Authenticator, 1Password, or Authy:
            </p>
            <p className="font-mono-code rounded-lg border border-[#EAEAEA] bg-white px-3 py-2 text-xs font-semibold text-[#151515] select-all">
              {enrollData.secret}
            </p>
            <p className="font-mono-code break-all text-[11px] text-[#676767]">{enrollData.otpauthUri}</p>

            <div>
              <p className="text-xs font-semibold text-[#151515]">Single-Use Recovery Codes (save offline):</p>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5 font-mono-code text-xs">
                {enrollData.recoveryCodes.map((code) => (
                  <span key={code} className="rounded border border-[#EAEAEA] bg-white px-2 py-1 text-center">
                    {code}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={totpConfirm}
                onChange={(e) => setTotpConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit TOTP code"
                className="font-mono-code h-10 flex-1 rounded-lg border border-[#DCDCDC] bg-white px-3 text-sm"
              />
              <button type="submit" className="btn-admin-green">
                Verify &amp; Activate
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

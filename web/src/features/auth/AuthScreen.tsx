import { KeyRound, Loader2, Phone, QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';
import { FormEvent, useEffect, useState } from 'react';

import { persistEncryptedSession } from '../../services/crypto.service';
import { useTeletonStore } from '../../shared/store/useTeletonStore';

export function AuthScreen() {
  const authStatus = useTeletonStore((state) => state.authStatus);
  const authError = useTeletonStore((state) => state.authError);
  const qrLoginLink = useTeletonStore((state) => state.qrLoginLink);
  const qrLoginUpdatedAt = useTeletonStore((state) => state.qrLoginUpdatedAt);
  const sessionId = useTeletonStore((state) => state.sessionId);
  const initializeTelegram = useTeletonStore((state) => state.initializeTelegram);
  const restartTelegramAuth = useTeletonStore((state) => state.restartTelegramAuth);
  const requestQrLogin = useTeletonStore((state) => state.requestQrLogin);
  const submitPhone = useTeletonStore((state) => state.submitPhone);
  const submitCode = useTeletonStore((state) => state.submitCode);
  const submitPassword = useTeletonStore((state) => state.submitPassword);
  const [authMethod, setAuthMethod] = useState<'phone' | 'qr'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [rememberSession, setRememberSession] = useState(false);
  const [persisted, setPersisted] = useState(false);

  useEffect(() => {
    if (authStatus === 'idle') void initializeTelegram();
  }, [authStatus, initializeTelegram]);

  useEffect(() => {
    if (authStatus === 'ready' && rememberSession && !persisted) {
      void persistEncryptedSession({ sessionId, savedAt: new Date().toISOString() }, { consent: true }).then(() =>
        setPersisted(true)
      );
    }
  }, [authStatus, persisted, rememberSession, sessionId]);

  useEffect(() => {
    let active = true;
    setQrCodeDataUrl('');

    if (!qrLoginLink) {
      return () => {
        active = false;
      };
    }

    void QRCode.toDataURL(qrLoginLink, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 224,
      color: {
        dark: '#102027',
        light: '#ffffff'
      }
    })
      .then((dataUrl) => {
        if (active) setQrCodeDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setQrCodeDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [qrLoginLink]);

  const submit = (event: FormEvent) => {
    event.preventDefault();

    if (authStatus === 'phone-required') void submitPhone(phoneNumber);
    if (authStatus === 'code-required') void submitCode(code);
    if (authStatus === 'password-required') void submitPassword(password);
  };

  const selectPhoneLogin = () => {
    setAuthMethod('phone');
    if (authStatus === 'qr-required') void restartTelegramAuth();
  };

  const selectQrLogin = () => {
    setAuthMethod('qr');
    if (authStatus === 'phone-required' || authStatus === 'qr-required') void requestQrLogin();
  };

  const icon =
    authStatus === 'qr-required' ? (
      <QrCode size={20} />
    ) : authStatus === 'phone-required' ? (
      <Phone size={20} />
    ) : authStatus === 'password-required' ? (
      <ShieldCheck size={20} />
    ) : (
      <KeyRound size={20} />
    );

  return (
    <section className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-h-[300px] flex-col bg-ink px-6 py-7 text-white sm:min-h-[360px] sm:px-10 lg:min-h-screen">
        <div className="flex items-center gap-3">
          <img src="/icons/icon-192.png" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-lg font-semibold">Teleton Client</h1>
            <p className="text-sm text-white/64">Alpha Web</p>
          </div>
        </div>

        <div className="mt-10 grid max-w-xl gap-3">
          {[
            ['TDLib', authStatus === 'error' ? 'blocked' : authStatus === 'initializing' ? 'starting' : 'ready'],
            ['Agent', 'optional'],
            ['TON', 'confirmable']
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[1fr_auto] items-center border border-white/14 bg-white/8 px-4 py-3">
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-xs uppercase text-white/62">{value}</span>
            </div>
          ))}
        </div>

        <div className="mt-auto hidden max-w-xl grid-cols-3 gap-3 pt-10 sm:grid">
          <div className="h-24 border border-white/14 bg-white/8" />
          <div className="h-24 border border-white/14 bg-mint/25" />
          <div className="h-24 border border-white/14 bg-saffron/25" />
        </div>
      </div>

      <div className="flex items-center bg-paper px-5 py-8 sm:px-8">
        <form className="w-full border border-mist bg-white p-6 shadow-panel" onSubmit={submit}>
          <div className="mb-6 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center bg-teal text-white">{icon}</span>
            <div>
              <h2 className="text-lg font-semibold">Telegram sign in</h2>
              <p className="text-sm text-ink/58">{authStatus === 'initializing' ? 'Initializing TDLib' : authStatus}</p>
            </div>
          </div>

          {(authStatus === 'phone-required' || authStatus === 'qr-required') && (
            <div className="mb-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={authMethod === 'phone'}
                className={`flex h-10 items-center justify-center gap-2 border px-3 text-sm font-semibold ${
                  authMethod === 'phone'
                    ? 'border-teal bg-teal text-white'
                    : 'border-mist bg-white text-ink hover:border-teal'
                }`}
                onClick={selectPhoneLogin}
              >
                <Phone size={16} />
                <span>Phone</span>
              </button>
              <button
                type="button"
                aria-pressed={authMethod === 'qr'}
                className={`flex h-10 items-center justify-center gap-2 border px-3 text-sm font-semibold ${
                  authMethod === 'qr' ? 'border-teal bg-teal text-white' : 'border-mist bg-white text-ink hover:border-teal'
                }`}
                onClick={selectQrLogin}
              >
                <QrCode size={16} />
                <span>QR code</span>
              </button>
            </div>
          )}

          {authStatus === 'initializing' && (
            <div className="mb-5 flex items-center gap-2 text-sm text-ink/64">
              <Loader2 className="animate-spin" size={16} />
              <span>Starting web TDLib runtime</span>
            </div>
          )}

          {authStatus === 'qr-required' && (
            <div className="mb-5">
              <div className="grid min-h-[256px] place-items-center border border-mist bg-paper p-4">
                {qrCodeDataUrl ? (
                  <img src={qrCodeDataUrl} alt="Telegram login QR code" className="h-56 w-56" />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-ink/64">
                    <Loader2 className="animate-spin" size={16} />
                    <span>Waiting for QR link</span>
                  </div>
                )}
              </div>
              <p className="mt-3 text-sm text-ink/64">Scan with Telegram on a signed-in device.</p>
              <p className="mt-1 text-xs text-ink/48">
                {qrLoginUpdatedAt ? `Updated ${new Date(qrLoginUpdatedAt).toLocaleTimeString()}` : 'Awaiting TDLib update'}
              </p>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="flex h-10 items-center justify-center gap-2 border border-mist px-3 text-sm font-semibold text-ink hover:border-teal"
                  onClick={() => void requestQrLogin()}
                >
                  <RefreshCw size={16} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  className="flex h-10 items-center justify-center gap-2 border border-mist px-3 text-sm font-semibold text-ink hover:border-teal"
                  onClick={selectPhoneLogin}
                >
                  <Phone size={16} />
                  <span>Use phone</span>
                </button>
              </div>
            </div>
          )}

          {authStatus === 'phone-required' && (
            <label className="mb-4 block text-sm font-medium">
              Phone number
              <input
                className="mt-2 h-11 w-full border border-mist px-3"
                inputMode="tel"
                autoComplete="tel"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="+15551234567"
                required
              />
            </label>
          )}

          {authStatus === 'code-required' && (
            <label className="mb-4 block text-sm font-medium">
              Code
              <input
                className="mt-2 h-11 w-full border border-mist px-3"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </label>
          )}

          {authStatus === 'password-required' && (
            <label className="mb-4 block text-sm font-medium">
              Password
              <input
                className="mt-2 h-11 w-full border border-mist px-3"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
          )}

          <label className="mb-5 flex items-center gap-3 text-sm text-ink/70">
            <input
              type="checkbox"
              checked={rememberSession}
              onChange={(event) => setRememberSession(event.target.checked)}
            />
            <span>Save encrypted session on this device</span>
          </label>

          {authError && <p className="mb-4 border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">{authError}</p>}

          {authStatus !== 'qr-required' && (
            <button
              type="submit"
              className="flex h-11 w-full items-center justify-center gap-2 bg-teal px-4 font-semibold text-white hover:bg-ink disabled:cursor-not-allowed disabled:bg-ink/30"
              disabled={authStatus === 'initializing' || authStatus === 'error' || authStatus === 'ready'}
            >
              {authStatus === 'phone-required' ? 'Send code' : authStatus === 'ready' ? 'Signed in' : 'Continue'}
            </button>
          )}
        </form>
      </div>
    </section>
  );
}

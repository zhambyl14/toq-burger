'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { BackBtn, Logo, Spinner } from '@/components/ui';
import { formatTenDigits, maskPhone } from '@/lib/phone';
import { sb, supabaseConfigured } from '@/lib/supabase/client';
import { homeForRoles, type Role } from '@/hooks/useSession';

const ERR: Record<string, string> = {
  INVALID_PHONE: 'Проверьте номер: 10 цифр после +7',
  COOLDOWN: 'Код уже отправлен. Подождите минуту',
  RATE_LIMITED: 'Слишком много попыток. Попробуйте позже',
  WHATSAPP_UNAVAILABLE: 'Отправка в WhatsApp временно недоступна',
  WHATSAPP_SEND_FAILED: 'Не удалось отправить код в WhatsApp. Попробуйте ещё раз',
  SERVER_NOT_CONFIGURED: 'Сервер не настроен',
  INVALID: 'Неверный код',
  EXPIRED: 'Срок действия кода истёк. Запросите новый',
  LOCKED: 'Слишком много неверных попыток. Запросите новый код',
  NOT_FOUND: 'Код недействителен. Запросите новый',
  INVALID_INPUT: 'Введите 6 цифр',
};

function WhatsAppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#25D366" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" />
      <path fill="#fff" d="M17.3 14.6c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.6.1l-.9 1.1c-.2.2-.3.2-.6.1a7.6 7.6 0 0 1-3.8-3.3c-.3-.5.3-.5.8-1.6.1-.2 0-.4 0-.5l-.9-2c-.2-.6-.5-.5-.6-.5h-.6a1 1 0 0 0-.8.4 3.2 3.2 0 0 0-1 2.4 5.7 5.7 0 0 0 1.2 3 12.8 12.8 0 0 0 4.9 4.3c1.8.8 2.5.8 3.4.7.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3z" />
    </svg>
  );
}

function Auth() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next');
  const [step, setStep] = useState<'phone' | 'otp' | 'done'>('phone');
  const [ten, setTen] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [left, setLeft] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const otpRef = useRef<HTMLInputElement>(null);
  const phone = '+7' + ten;

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  useEffect(() => {
    if (step === 'otp') otpRef.current?.focus();
  }, [step]);

  const fail = (code: string) => { setErr(ERR[code] ?? 'Что-то пошло не так. Попробуйте ещё раз'); setShake((s) => s + 1); };

  const sendCode = async () => {
    if (ten.length !== 10 || busy) return fail('INVALID_PHONE');
    if (!supabaseConfigured()) return fail('SERVER_NOT_CONFIGURED');
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/auth/otp/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone }) });
      const j = await r.json();
      if (!r.ok) {
        if (j.error === 'COOLDOWN' && step === 'phone') { setStep('otp'); setLeft(j.retryAfter ?? 60); return; }
        return fail(j.error);
      }
      setDevCode(j.devCode ?? null);
      setCode('');
      setLeft(j.resendIn ?? 60);
      setStep('otp');
    } catch {
      fail('NETWORK');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (c = code) => {
    if (c.length !== 6 || busy) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/auth/otp/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, code: c }) });
      const j = await r.json();
      if (!r.ok) { setCode(''); return fail(j.error); }
      const { error } = await sb().auth.verifyOtp({ token_hash: j.tokenHash, type: 'email' });
      if (error) return fail('SESSION');
      setStep('done');
      const { data: roles } = await sb().rpc('my_roles');
      const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : homeForRoles((roles as Role[]) ?? []);
      setTimeout(() => router.replace(dest), 1100);
    } catch {
      fail('NETWORK');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'done') {
    return (
      <div className="scr-in" style={{ flex: 1, minHeight: '100dvh', background: '#141210', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
        <div style={{ width: 96, height: 96, borderRadius: '50%', background: '#FF6A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'ping 1.4s infinite' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
        </div>
        <div className="disp" style={{ fontSize: 26, fontWeight: 800, marginTop: 28 }}>Добро пожаловать!</div>
        <div style={{ fontSize: 14, opacity: 0.75, marginTop: 10, fontWeight: 600 }}>Вы вошли. Перенаправляем…</div>
      </div>
    );
  }

  return (
    <div className="scr-in" style={{ flex: 1, minHeight: '100dvh', background: '#FF6A0A', display: 'flex', flexDirection: 'column', padding: 16, color: '#fff' }}>
      <BackBtn light onClick={() => (step === 'otp' ? (setStep('phone'), setErr('')) : window.history.length > 1 ? router.back() : router.push('/'))} />

      {step === 'phone' ? (
        <>
          <div style={{ marginTop: 32 }}><Logo size={56} radius={18} /></div>
          <h1 className="disp" style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.05, marginTop: 20 }}>Добро пожаловать в<br />TOK BURGER</h1>
          <div style={{ fontSize: 14, marginTop: 10, fontWeight: 600, opacity: 0.95 }}>Введите номер телефона, чтобы продолжить. Қош келдіңіз!</div>
          <form onSubmit={(e) => { e.preventDefault(); sendCode(); }} style={{ marginTop: 28, background: '#fff', borderRadius: 24, padding: 20, color: '#141210' }}>
            <label htmlFor="ph" style={{ fontSize: 12, fontWeight: 800, color: '#6B6258' }}>НОМЕР ТЕЛЕФОНА</label>
            <div key={shake} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, height: 56, borderRadius: 16, background: '#F3EADF', padding: '0 14px', animation: shake ? 'shake .4s' : undefined, border: `2px solid ${err ? '#B3261E' : 'transparent'}` }}>
              <span aria-hidden="true" style={{ fontWeight: 800, fontSize: 18, userSelect: 'none' }}>+7</span>
              <input id="ph" value={formatTenDigits(ten)} inputMode="numeric" autoComplete="tel-national" placeholder="747 400 53 47" aria-label="Номер телефона после +7" aria-invalid={!!err}
                onChange={(e) => {
                  let d = e.target.value.replace(/\D/g, '');
                  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) d = d.slice(1); // pasted full number
                  setTen(d.slice(0, 10)); setErr('');
                }}
                style={{ flex: 1, minWidth: 0, height: '100%', border: 0, background: 'none', fontSize: 18, fontWeight: 800, outline: 'none' }} autoFocus />
            </div>
            {err && <div role="alert" style={{ color: '#B3261E', fontSize: 13, fontWeight: 700, marginTop: 8 }}>{err}</div>}
            <button type="submit" className="btn dark" disabled={busy} style={{ marginTop: 16, width: '100%', height: 56, borderRadius: 28, fontSize: 16, opacity: ten.length === 10 ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {busy ? <Spinner /> : <><WhatsAppIcon /> Получить код</>}
            </button>
            <div style={{ fontSize: 11, color: '#6B6258', marginTop: 12, lineHeight: 1.4, fontWeight: 600 }}>Код подтверждения придёт в WhatsApp на этот номер.</div>
          </form>
        </>
      ) : (
        <>
          <h1 className="disp" style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.05, marginTop: 40 }}>Подтвердите номер</h1>
          <div style={{ fontSize: 14, marginTop: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <WhatsAppIcon /> Мы отправили код подтверждения в WhatsApp: {maskPhone(phone)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); verify(); }} style={{ marginTop: 28, background: '#fff', borderRadius: 24, padding: 20, color: '#141210' }}>
            <label htmlFor="otp" style={{ fontSize: 12, fontWeight: 800, color: '#6B6258' }}>6-ЗНАЧНЫЙ КОД</label>
            <div key={shake} onClick={() => otpRef.current?.focus()} style={{ position: 'relative', display: 'flex', gap: 8, marginTop: 10, animation: shake ? 'shake .4s' : undefined }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ flex: 1, height: 56, borderRadius: 14, background: '#F3EADF', border: `2px solid ${err ? '#B3261E' : i === code.length ? '#FF6A0A' : 'transparent'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800 }}>{code[i] ?? ''}</div>
              ))}
              <input ref={otpRef} id="otp" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="Код из WhatsApp"
                onChange={(e) => { const c = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(c); setErr(''); if (c.length === 6) verify(c); }}
                style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', fontSize: 16 }} />
            </div>
            {err && <div role="alert" style={{ color: '#B3261E', fontSize: 13, fontWeight: 700, marginTop: 8 }}>{err}</div>}
            {devCode && <div style={{ fontSize: 12, color: '#C24D00', marginTop: 8, fontWeight: 700 }}>Режим разработки (WhatsApp не подключён): код {devCode}</div>}
            <button type="submit" className="btn dark" disabled={busy || code.length !== 6} style={{ marginTop: 14, width: '100%', height: 56, borderRadius: 28, fontSize: 16, opacity: code.length === 6 ? 1 : 0.4 }}>
              {busy ? <Spinner /> : 'Подтвердить'}
            </button>
            <button type="button" className="btn" onClick={sendCode} disabled={left > 0 || busy} style={{ marginTop: 8, width: '100%', minHeight: 44, fontWeight: 800, fontSize: 14, color: left > 0 ? '#6B6258' : '#C24D00' }}>
              {left > 0 ? `Отправить код повторно через 00:${String(left).padStart(2, '0')}` : 'Отправить код повторно'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <Auth />
    </Suspense>
  );
}

'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { BoltMark } from '@/components/customer/BoltMark';
import { Logo, Spinner } from '@/components/ui';
import { useLang } from '@/i18n/LangProvider';
import { LangSwitch } from '@/i18n/LangSwitch';
import { formatTenDigits, maskPhone } from '@/lib/phone';
import { sb, supabaseConfigured } from '@/lib/supabase/client';
import { homeForRoles, type Role } from '@/hooks/useSession';
import '@/styles/flow.css';

/** [ru, kk] by error code; the state keeps the code so the text follows the language switch. */
const ERR: Record<string, [string, string]> = {
  INVALID_PHONE: ['Проверьте номер: 10 цифр после +7', 'Нөмірді тексеріңіз: +7-ден кейін 10 сан'],
  COOLDOWN: ['Код уже отправлен. Подождите минуту', 'Код жіберілді. Бір минут күтіңіз'],
  RATE_LIMITED: ['Слишком много попыток. Попробуйте позже', 'Әрекет тым көп. Кейінірек көріңіз'],
  WHATSAPP_UNAVAILABLE: ['Отправка в WhatsApp временно недоступна', 'WhatsApp-қа жіберу уақытша қолжетімсіз'],
  WHATSAPP_SEND_FAILED: ['Не удалось отправить код в WhatsApp. Попробуйте ещё раз', 'Кодты WhatsApp-қа жіберу мүмкін болмады. Қайтадан көріңіз'],
  SERVER_NOT_CONFIGURED: ['Сервер не настроен', 'Сервер бапталмаған'],
  INVALID: ['Неверный код', 'Код дұрыс емес'],
  EXPIRED: ['Срок действия кода истёк. Запросите новый', 'Кодтың мерзімі өтті. Жаңасын сұраңыз'],
  LOCKED: ['Слишком много неверных попыток. Запросите новый код', 'Қате әрекет тым көп. Жаңа код сұраңыз'],
  NOT_FOUND: ['Код недействителен. Запросите новый', 'Код жарамсыз. Жаңасын сұраңыз'],
  INVALID_INPUT: ['Введите 6 цифр', '6 сан енгізіңіз'],
};
const ERR_DEFAULT: [string, string] = ['Что-то пошло не так. Попробуйте ещё раз', 'Бір нәрсе дұрыс болмады. Қайтадан көріңіз'];

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
  const { t } = useLang();
  const sp = useSearchParams();
  const next = sp.get('next');
  const [step, setStep] = useState<'phone' | 'otp' | 'done'>('phone');
  const [ten, setTen] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(''); // error code ('' = none)
  const [left, setLeft] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const otpRef = useRef<HTMLInputElement>(null);
  const phone = '+7' + ten;

  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  useEffect(() => {
    if (step === 'otp') otpRef.current?.focus();
  }, [step]);

  const fail = (code: string) => { setErr(code || 'UNKNOWN'); setShake((s) => s + 1); };
  const errPair = ERR[err] ?? ERR_DEFAULT;
  const errText = err ? t(errPair[0], errPair[1]) : '';

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
      if (j.direct && j.tokenHash) { // admin test mode: no code needed
        const { error } = await sb().auth.verifyOtp({ token_hash: j.tokenHash, type: 'email' });
        if (error) return fail('SESSION');
        setStep('done');
        const { data: roles } = await sb().rpc('my_roles');
        const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : homeForRoles((roles as Role[]) ?? []);
        setTimeout(() => router.replace(dest), 1100);
        return;
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
      <div className="scr-in fl-auth fl-auth--done">
        <div style={{ width: 96, height: 96, borderRadius: '50%', background: '#FF6A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'ping 1.4s infinite' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
        </div>
        <div className="disp" style={{ fontSize: 26, fontWeight: 800, marginTop: 28 }}>{t('Добро пожаловать!', 'Қош келдіңіз!')}</div>
        <div style={{ fontSize: 14, opacity: 0.75, marginTop: 10, fontWeight: 600 }}>{t('Вы вошли. Перенаправляем…', 'Сіз кірдіңіз. Бағыттаудамыз…')}</div>
      </div>
    );
  }

  const back = () => (step === 'otp' ? (setStep('phone'), setErr('')) : window.history.length > 1 ? router.back() : router.push('/'));

  return (
    <div className="scr-in fl-auth">
      <div className="only-desktop fl-auth__bg" aria-hidden="true"><BoltMark size={620} tone="ink" rotate={12} /></div>
      <div className="fl-auth__top">
        <button className="btn fl-back fl-back--light" onClick={back} aria-label={t('Назад', 'Артқа')}>←</button>
        <LangSwitch variant="onOrange" />
      </div>

      {step === 'phone' ? (
        <div className="fl-auth__body">
          <div className="fl-auth__hero">
            <div style={{ marginTop: 32 }}><Logo size={56} radius={18} /></div>
            <h1 className="disp fl-auth__h1">{t('Добро пожаловать в', 'Қош келдіңіз —')}<br />TOK BURGER</h1>
            <div style={{ fontSize: 14, marginTop: 10, fontWeight: 600, opacity: 0.95 }}>{t('Введите номер телефона, чтобы продолжить. Қош келдіңіз!', 'Жалғастыру үшін телефон нөміріңізді енгізіңіз. Добро пожаловать!')}</div>
            <div className="fl-auth__chips">
              {[t('100% халал', '100% халал'), t('Заказ без пароля', 'Құпиясөзсіз тапсырыс'), t('Отслеживание онлайн', 'Онлайн бақылау')].map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <div className="only-desktop fl-auth__bolt" aria-hidden="true"><BoltMark size={230} tone="ink" rotate={-8} /></div>
            <div className="only-mobile fl-auth__bolt-m" aria-hidden="true"><BoltMark size={84} tone="ink" rotate={-8} /></div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); sendCode(); }} className="fl-auth__card">
            <label htmlFor="ph" className="fl-cap">{t('НОМЕР ТЕЛЕФОНА', 'ТЕЛЕФОН НӨМІРІ')}</label>
            <div key={shake} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, height: 56, borderRadius: 16, background: '#F3EADF', padding: '0 14px', animation: shake ? 'shake .4s' : undefined, border: `2px solid ${err ? '#B3261E' : 'transparent'}` }}>
              <span aria-hidden="true" style={{ fontWeight: 800, fontSize: 18, userSelect: 'none' }}>+7</span>
              <input id="ph" value={formatTenDigits(ten)} inputMode="numeric" autoComplete="tel-national" placeholder="747 400 53 47" aria-label={t('Номер телефона после +7', '+7-ден кейінгі телефон нөмірі')} aria-invalid={!!err}
                onChange={(e) => {
                  let d = e.target.value.replace(/\D/g, '');
                  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) d = d.slice(1); // pasted full number
                  setTen(d.slice(0, 10)); setErr('');
                }}
                style={{ flex: 1, minWidth: 0, height: '100%', border: 0, background: 'none', fontSize: 18, fontWeight: 800, outline: 'none' }} autoFocus />
            </div>
            {err && <div role="alert" style={{ color: '#B3261E', fontSize: 13, fontWeight: 700, marginTop: 8 }}>{errText}</div>}
            <button type="submit" className="btn dark" disabled={busy} style={{ marginTop: 16, width: '100%', height: 56, borderRadius: 28, fontSize: 16, opacity: ten.length === 10 ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {busy ? <Spinner /> : <><WhatsAppIcon /> {t('Получить код', 'Кодты алу')}</>}
            </button>
            <div style={{ fontSize: 11, color: '#6B6258', marginTop: 12, lineHeight: 1.4, fontWeight: 600 }}>{t('Код подтверждения придёт в WhatsApp на этот номер.', 'Растау коды осы нөмірге WhatsApp арқылы келеді.')}</div>
          </form>
        </div>
      ) : (
        <div className="fl-auth__body">
          <div className="fl-auth__hero">
            <h1 className="disp fl-auth__h1" style={{ marginTop: 40 }}>{t('Подтвердите номер', 'Нөмірді растаңыз')}</h1>
            <div style={{ fontSize: 14, marginTop: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <WhatsAppIcon /> <span>{t('Мы отправили код подтверждения в WhatsApp: ', 'Растау кодын WhatsApp-қа жібердік: ')}{maskPhone(phone)}</span>
            </div>
            <div className="only-desktop fl-auth__bolt" aria-hidden="true"><BoltMark size={230} tone="ink" rotate={-8} /></div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="fl-auth__card" style={{ marginTop: 28 }}>
            <label htmlFor="otp" className="fl-cap">{t('6-ЗНАЧНЫЙ КОД', '6 САНДЫ КОД')}</label>
            <div key={shake} onClick={() => otpRef.current?.focus()} className="fl-otp" style={{ animation: shake ? 'shake .4s' : undefined }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ border: `2px solid ${err ? '#B3261E' : i === code.length ? '#FF6A0A' : 'transparent'}` }}>{code[i] ?? ''}</div>
              ))}
              <input ref={otpRef} id="otp" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label={t('Код из WhatsApp', 'WhatsApp-тағы код')}
                onChange={(e) => { const c = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(c); setErr(''); if (c.length === 6) verify(c); }}
                style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', fontSize: 16 }} />
            </div>
            {err && <div role="alert" style={{ color: '#B3261E', fontSize: 13, fontWeight: 700, marginTop: 8 }}>{errText}</div>}
            {devCode && <div style={{ fontSize: 12, color: '#C24D00', marginTop: 8, fontWeight: 700 }}>{t('Режим разработки (WhatsApp не подключён): код ', 'Әзірлеу режимі (WhatsApp қосылмаған): код ')}{devCode}</div>}
            <button type="submit" className="btn dark" disabled={busy || code.length !== 6} style={{ marginTop: 14, width: '100%', height: 56, borderRadius: 28, fontSize: 16, opacity: code.length === 6 ? 1 : 0.4 }}>
              {busy ? <Spinner /> : t('Подтвердить', 'Растау')}
            </button>
            <button type="button" className="btn" onClick={sendCode} disabled={left > 0 || busy} style={{ marginTop: 8, width: '100%', minHeight: 44, fontWeight: 800, fontSize: 14, color: left > 0 ? '#6B6258' : '#C24D00' }}>
              {left > 0 ? `${t('Отправить код повторно через', 'Кодты қайта жіберу —')} 00:${String(left).padStart(2, '0')}` : t('Отправить код повторно', 'Кодты қайта жіберу')}
            </button>
          </form>
        </div>
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

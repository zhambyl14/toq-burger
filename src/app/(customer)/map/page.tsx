'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map from '@/components/maps/Map';
import { useCatalog } from '@/components/CatalogProvider';
import { BackBtn, Spinner, toast } from '@/components/ui';
import { pickDeliveryBranch } from '@/features/branches/assign';
import { useMounted } from '@/features/catalog/hooks';
import { useApp } from '@/stores/app';
import { fmt } from '@/lib/money';

type P = { lat: number; lon: number };

export default function MapPage() {
  const router = useRouter();
  const { branches, hours } = useCatalog();
  const mounted = useMounted();
  const saved = useApp((s) => s.address);
  const setApp = useApp((s) => s.set);
  const [pinState, setPin] = useState<P | null>(null);
  const [labelState, setLabel] = useState<string | null>(null);
  // until the user picks a point, show the saved address
  const savedPin = useMemo(() => (mounted && saved ? { lat: saved.lat, lon: saved.lon } : null), [mounted, saved]);
  const pin = pinState ?? savedPin;
  const label = labelState ?? (mounted && saved ? saved.label : '');
  const [resolving, setResolving] = useState(false);
  const [q, setQ] = useState('');
  const [found, setResults] = useState<{ lat: number; lon: number; label: string }[]>([]);
  const results = q.trim().length >= 3 ? found : [];
  const [locating, setLocating] = useState(false);
  const reqId = useRef(0);

  const reverse = useCallback(async (p: P) => {
    const id = ++reqId.current;
    setResolving(true);
    try {
      const r = await fetch(`/api/geocode?lat=${p.lat.toFixed(6)}&lon=${p.lon.toFixed(6)}`);
      const j = await r.json();
      if (id === reqId.current) setLabel(j.label || `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`);
    } catch {
      if (id === reqId.current) setLabel(`${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`);
    } finally {
      if (id === reqId.current) setResolving(false);
    }
  }, []);

  const onPick = useCallback((p: P) => {
    setPin(p);
    setResults([]);
    reverse(p);
  }, [reverse]);

  // debounced address search
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`);
        const j = await r.json();
        setResults(j.results ?? []);
      } catch { setResults([]); }
    }, 600);
    return () => clearTimeout(t);
  }, [q]);

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) return toast('Геолокация недоступна в этом браузере');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); onPick({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
      (err) => { setLocating(false); toast(err.code === 1 ? 'Доступ к геолокации запрещён — отметьте точку на карте' : 'Не удалось определить местоположение'); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const pick = useMemo(() => (pin ? pickDeliveryBranch(pin, branches, hours) : null), [pin, branches, hours]);
  const markers = useMemo(() => branches.filter((b) => b.lat != null && b.lon != null)
    .map((b) => ({ id: b.id, lat: b.lat!, lon: b.lon!, label: b.short_name, active: pick?.branch?.id === b.id })), [branches, pick]);
  const ok = !!pick?.branch;

  let title = 'ВЫБЕРИТЕ ТОЧКУ', big = 'Нажмите на карту или перетащите метку.', small = '';
  if (pick) {
    if (pick.reason === 'OK') {
      title = 'БЛИЖАЙШИЙ ФИЛИАЛ';
      big = `${pick.branch!.name}. Ваш заказ будет приготовлен в ближайшем TOK BURGER.`;
      small = `По прямой: ${pick.distanceKm!.toFixed(1)} км · доставка ${fmt(pick.branch!.delivery_fee_kzt)}`;
    } else if (pick.reason === 'CLOSED') {
      title = 'ФИЛИАЛ ЗАКРЫТ';
      big = 'Ближайший филиал сейчас не принимает заказы (перерыв 06:00–08:00). Можно оформить заказ ко времени.';
    } else if (pick.reason === 'NO_VERIFIED_BRANCHES') {
      title = 'ДОСТАВКА НЕ НАСТРОЕНА';
      big = 'Координаты филиалов ещё не подтверждены администратором. Доступен самовывоз.';
    } else {
      title = 'АДРЕС ВНЕ ЗОНЫ';
      big = 'Ни один филиал не доставляет по этому адресу. Выберите точку ближе или самовывоз.';
      small = pick.nearest ? `Ближайший филиал: ${pick.nearest.branch.short_name} (${pick.nearest.distanceKm.toFixed(1)} км), зона доставки ${pick.nearest.branch.delivery_radius_km} км.` : '';
    }
  }
  const bg = !pick ? '#141210' : ok ? '#2E8B3F' : pick.reason === 'CLOSED' ? '#C24D00' : '#B3261E';
  const canConfirm = !!pin && !resolving && (ok || pick?.reason === 'CLOSED');

  const confirm = () => {
    if (!pin || !canConfirm) return;
    setApp({ address: { lat: pin.lat, lon: pin.lon, label: label || 'Точка на карте' }, mode: 'DELIVERY' });
    toast('Адрес сохранён' + (pick?.branch ? ' · ' + pick.branch.short_name : ''));
    if (window.history.length > 1) router.back(); else router.push('/');
  };

  return (
    <div className="scr-in" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <BackBtn onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))} />
        <h1 className="disp" style={{ fontSize: 20, fontWeight: 800 }}>Куда доставить?</h1>
      </div>

      <div style={{ position: 'relative', marginTop: 14 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Улица и дом, например «Абая 10»" aria-label="Поиск адреса" className="field" style={{ height: 52, borderRadius: 16, border: 0 }} />
        {results.length > 0 && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: 56, zIndex: 20, background: '#fff', borderRadius: 16, boxShadow: '0 10px 28px rgba(120,60,0,.18)', overflow: 'hidden' }}>
            {results.map((r, i) => (
              <button key={i} className="btn" onClick={() => { setQ(''); setPin({ lat: r.lat, lon: r.lon }); setLabel(r.label); setResults([]); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', fontWeight: 700, fontSize: 14, borderTop: i ? '1px solid #F3EADF' : 0 }}>{r.label}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, height: 'min(56vh, 420px)', borderRadius: 26, overflow: 'hidden', boxShadow: '0 10px 28px rgba(120,60,0,.12)' }}>
        <Map branches={markers} pin={pin} onPick={onPick} height="100%" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={useMyLocation} disabled={locating} style={{ flex: 1, minHeight: 48, borderRadius: 16, background: '#fff', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {locating ? <Spinner dark /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>}
          Моё местоположение
        </button>
        <button className="btn" onClick={() => { setApp({ mode: 'PICKUP' }); router.push('/branches'); }} style={{ flex: 1, minHeight: 48, borderRadius: 16, background: '#fff', fontWeight: 800, fontSize: 13 }}>Самовывоз</button>
      </div>

      {pin && (
        <div style={{ marginTop: 12, background: '#fff', borderRadius: 16, padding: '12px 14px', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          {resolving ? <><Spinner dark /> Определяем адрес…</> : label}
        </div>
      )}

      <div style={{ marginTop: 12, background: bg, color: '#fff', borderRadius: 20, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>{title}</div>
        <div style={{ fontWeight: 800, fontSize: 15, marginTop: 4 }}>{big}</div>
        {small && <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600, opacity: 0.9 }}>{small}</div>}
      </div>
      <button className="btn dark" onClick={confirm} disabled={!canConfirm} style={{ marginTop: 12, width: '100%', height: 56, borderRadius: 28, fontSize: 16, opacity: canConfirm ? 1 : 0.4 }}>Подтвердить адрес</button>
      <div style={{ height: 8 }} />
    </div>
  );
}

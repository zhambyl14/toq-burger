'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map from '@/components/maps/Map';
import { useCatalog } from '@/components/CatalogProvider';
import { PinIcon, Spinner, toast } from '@/components/ui';
import { pickDeliveryBranch } from '@/features/branches/assign';
import { useMounted } from '@/features/catalog/hooks';
import { useLang } from '@/i18n/LangProvider';
import { useApp } from '@/stores/app';
import { fmt } from '@/lib/money';
import '@/styles/flow.css';

type P = { lat: number; lon: number };

export default function MapPage() {
  const router = useRouter();
  const { t } = useLang();
  const { branches, hours, area } = useCatalog();
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
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`);
        const j = await r.json();
        setResults(j.results ?? []);
      } catch { setResults([]); }
    }, 600);
    return () => clearTimeout(timer);
  }, [q]);

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) return toast(t('Геолокация недоступна в этом браузере', 'Бұл браузерде геолокация қолжетімсіз'));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); onPick({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
      (err) => { setLocating(false); toast(err.code === 1 ? t('Доступ к геолокации запрещён — отметьте точку на карте', 'Геолокацияға тыйым салынған — нүктені картадан белгілеңіз') : t('Не удалось определить местоположение', 'Орналасқан жерді анықтау мүмкін болмады')); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const pick = useMemo(() => (pin ? pickDeliveryBranch(pin, branches, hours, area) : null), [pin, branches, hours, area]);
  const markers = useMemo(() => branches.filter((b) => b.lat != null && b.lon != null)
    .map((b) => ({ id: b.id, lat: b.lat!, lon: b.lon!, label: b.short_name, active: pick?.branch?.id === b.id })), [branches, pick]);
  const ok = !!pick?.branch;

  let title = t('ВЫБЕРИТЕ ТОЧКУ', 'НҮКТЕНІ ТАҢДАҢЫЗ'), big = t('Нажмите на карту или перетащите метку.', 'Картаны басыңыз немесе белгіні жылжытыңыз.'), small = '';
  if (pick) {
    if (pick.reason === 'OK') {
      title = t('БЛИЖАЙШИЙ ФИЛИАЛ', 'ЕҢ ЖАҚЫН ФИЛИАЛ');
      big = `${pick.branch!.name}. ${t('Ваш заказ будет приготовлен в ближайшем TOK BURGER.', 'Тапсырысыңыз ең жақын TOK BURGER-де дайындалады.')}`;
      small = `${t('По прямой', 'Түзу сызықпен')}: ${pick.distanceKm!.toFixed(1)} ${t('км', 'км')} · ${t('доставка', 'жеткізу')} ${fmt(pick.branch!.delivery_fee_kzt)}`;
    } else if (pick.reason === 'CLOSED') {
      title = t('ФИЛИАЛ ЗАКРЫТ', 'ФИЛИАЛ ЖАБЫҚ');
      big = t('Ближайший филиал сейчас не принимает заказы (перерыв 06:00–08:00). Можно оформить заказ ко времени.', 'Ең жақын филиал қазір тапсырыс қабылдамайды (үзіліс 06:00–08:00). Тапсырысты уақытқа беруге болады.');
    } else if (pick.reason === 'OUTSIDE_CITY') {
      title = t('АДРЕС ВНЕ АЛМАТЫ', 'МЕКЕНЖАЙ АЛМАТЫДАН ТЫС');
      big = t('Мы доставляем только по Алматы. Поставьте метку в пределах города или выберите самовывоз.', 'Біз тек Алматы бойынша жеткіземіз. Белгіні қала ішіне қойыңыз немесе өзі алып кетуді таңдаңыз.');
      small = pick.nearest ? `${t('Ближайший филиал', 'Ең жақын филиал')}: ${pick.nearest.branch.short_name}, ${pick.nearest.distanceKm.toFixed(1)} ${t('км по прямой', 'км түзу сызықпен')}` : '';
    } else {
      title = t('ФИЛИАЛЫ НЕДОСТУПНЫ', 'ФИЛИАЛДАР ҚОЛЖЕТІМСІЗ');
      big = t('Сейчас ни один филиал не принимает заказы. Попробуйте позже или выберите самовывоз.', 'Қазір ешбір филиал тапсырыс қабылдамайды. Кейінірек көріңіз немесе өзі алып кетуді таңдаңыз.');
    }
  }
  const bg = !pick ? '#141210' : ok ? '#2E8B3F' : pick.reason === 'CLOSED' ? '#C24D00' : '#B3261E';
  const canConfirm = !!pin && !resolving && (ok || pick?.reason === 'CLOSED');

  const confirm = () => {
    if (!pin || !canConfirm) return;
    setApp({ address: { lat: pin.lat, lon: pin.lon, label: label || t('Точка на карте', 'Картадағы нүкте') }, mode: 'DELIVERY' });
    toast(t('Адрес сохранён', 'Мекенжай сақталды') + (pick?.branch ? ' · ' + pick.branch.short_name : ''));
    if (window.history.length > 1) router.back(); else router.push('/');
  };

  const confirmBtn = (
    <button className="btn dark" onClick={confirm} disabled={!canConfirm} style={{ height: 56, borderRadius: 28, fontSize: 16, opacity: canConfirm ? 1 : 0.4 }}>{t('Подтвердить адрес', 'Мекенжайды растау')}</button>
  );

  return (
    <div className="scr-in fl-page">
      <div className="fl-head">
        <button className="btn fl-back" onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))} aria-label={t('Назад', 'Артқа')}>←</button>
        <h1 className="disp fl-title">{t('Куда доставить?', 'Қайда жеткіземіз?')}</h1>
      </div>

      <div className="fl-map">
        <div style={{ minWidth: 0 }}>
          <div className="fl-map__search">
            <span aria-hidden="true" style={{ position: 'absolute', left: 13, top: 15, pointerEvents: 'none' }}><PinIcon size={22} /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Улица и дом, например «Абая 10»', 'Көше және үй, мысалы «Абай 10»')} aria-label={t('Поиск адреса', 'Мекенжай іздеу')} className="field" style={{ height: 52, borderRadius: 18, border: '2px solid #FFD9B8', paddingLeft: 44, boxShadow: '0 6px 18px rgba(120,60,0,.08)' }} />
            {results.length > 0 && (
              <div className="fl-map__results">
                {results.map((r, i) => (
                  <button key={i} className="btn" onClick={() => { reqId.current++; setResolving(false); setQ(''); setPin({ lat: r.lat, lon: r.lon }); setLabel(r.label); setResults([]); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', fontWeight: 700, fontSize: 14, borderTop: i ? '1px solid #F3EADF' : 0 }}>{r.label}</button>
                ))}
              </div>
            )}
          </div>

          <div className="fl-map__box">
            {mounted ? <Map branches={markers} pin={pin} onPick={onPick} height="100%" /> : <div style={{ height: '100%', background: '#F3EADF', animation: 'fade .9s ease-in-out infinite alternate' }} aria-label={t('Загрузка карты', 'Карта жүктелуде')} />}
          </div>
        </div>

        <div className="fl-map__side dsticky">
          <div className="fl-map__btns">
            <button className="btn" onClick={useMyLocation} disabled={locating}>
              {locating ? <Spinner dark /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>}
              {t('Моё местоположение', 'Менің орным')}
            </button>
            <button className="btn" onClick={() => { setApp({ mode: 'PICKUP' }); router.push('/branches'); }}>{t('Самовывоз из филиала', 'Филиалдан өзі алып кету')}</button>
          </div>

          {pin ? (
            <div className="fl-card fl-card--o" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
              <span style={{ flex: 'none', width: 44, height: 44, borderRadius: 14, background: '#FFF1E0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PinIcon /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="fl-cap">{t('АДРЕС ДОСТАВКИ', 'ЖЕТКІЗУ МЕКЕНЖАЙЫ')}</div>
                <div aria-live="polite" style={{ fontWeight: 800, fontSize: 14, marginTop: 2 }}>{resolving ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Spinner dark /> {t('Определяем адрес…', 'Мекенжай анықталуда…')}</span> : label}</div>
                {pick?.branch && pick.distanceKm != null && <div style={{ fontSize: 12, fontWeight: 700, color: '#2E8B3F', marginTop: 3 }}>{pick.branch.short_name} · {pick.distanceKm.toFixed(1)} {t('км от вас', 'км сізден')}</div>}
              </div>
            </div>
          ) : (
            <div style={{ background: '#FFF1E0', borderRadius: 22, padding: 14, fontSize: 13, fontWeight: 700, color: '#C24D00' }}>{t('Найдите адрес в поиске, нажмите на карту или используйте «Моё местоположение».', 'Мекенжайды іздеуден табыңыз, картаны басыңыз немесе «Менің орным» түймесін қолданыңыз.')}</div>
          )}

          <div style={{ background: bg, color: '#fff', borderRadius: 22, padding: 16 }} role="status">
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>{title}</div>
            <div style={{ fontWeight: 800, fontSize: 15, marginTop: 4 }}>{big}</div>
            {small && <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600, opacity: 0.9 }}>{small}</div>}
          </div>

          <div className="only-desktop fl-cta">{confirmBtn}</div>
        </div>
      </div>

      <div className="only-mobile fl-cta fl-cta--flat" style={{ marginTop: 12 }}>{confirmBtn}</div>
    </div>
  );
}

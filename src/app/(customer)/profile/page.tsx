'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { Spinner, toast } from '@/components/ui';
import { BoltMark } from '@/components/customer/BoltMark';
import { PriceTag } from '@/components/customer/PriceTag';
import { useMounted } from '@/features/catalog/hooks';
import { SupportCenter } from '@/features/support/SupportCenter';
import { ACTIVE, dateShortL, STATUS_COLOR, statusLabel } from '@/features/orders/status';
import { signOut, useSession } from '@/hooks/useSession';
import { useLang } from '@/i18n/LangProvider';
import { LangSwitch } from '@/i18n/LangSwitch';
import { useApp } from '@/stores/app';
import { formatPhone } from '@/lib/phone';
import { sb } from '@/lib/supabase/client';
import type { Meat, OrderRow } from '@/types/catalog';
import '@/styles/flow.css';

type Tab = 'orders' | 'data' | 'addresses' | 'support';
const TAB_IDS: Tab[] = ['orders', 'data', 'addresses', 'support'];

interface Addr { id: string; label: string | null; address_text: string; lat: number; lon: number; apartment: string | null }

function Profile() {
  const router = useRouter();
  const sp = useSearchParams();
  const session = useSession();
  const mounted = useMounted();
  const { t, tx, lang, locale } = useLang();
  const { products, extras: catalogExtras } = useCatalog();
  const app = useApp();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [addrs, setAddrs] = useState<Addr[]>([]);
  const [bonus, setBonus] = useState(0);
  const [name, setName] = useState('');
  const [notif, setNotif] = useState(true);
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const TABS: { id: Tab; label: string }[] = [
    { id: 'orders', label: t('Мои заказы', 'Менің тапсырыстарым') }, { id: 'data', label: t('Данные', 'Деректер') },
    { id: 'addresses', label: t('Адреса', 'Мекенжайлар') }, { id: 'support', label: t('Поддержка', 'Қолдау қызметі') },
  ];
  const rawTab = sp.get('tab');
  const supportOrder = sp.get('order') ?? sp.get('support');
  const tab: Tab = TAB_IDS.some((x) => x === rawTab) ? (rawTab as Tab) : supportOrder ? 'support' : 'orders';
  const goTab = (next: Tab, order?: string) => router.replace(`/profile?tab=${next}${order ? `&order=${order}` : ''}`, { scroll: false });
  const uid = session.user?.id;

  const load = useCallback(async () => {
    if (!uid) return;
    const [o, a, l, p, f] = await Promise.all([
      sb().from('orders').select('*, order_items(*)').eq('user_id', uid).order('created_at', { ascending: false }).limit(20),
      sb().from('customer_addresses').select('id,label,address_text,lat,lon,apartment').eq('user_id', uid).order('created_at', { ascending: false }),
      sb().from('loyalty_accounts').select('balance').eq('user_id', uid).maybeSingle(),
      sb().from('profiles').select('full_name,notifications_enabled').eq('id', uid).maybeSingle(),
      sb().from('favorites').select('product_id').eq('user_id', uid),
    ]);
    if (o.error || a.error || l.error || p.error || f.error) toast(tRef.current('Не удалось загрузить часть данных профиля', 'Профиль деректерінің бір бөлігін жүктеу мүмкін болмады'));
    setOrders((o.data as OrderRow[]) ?? []);
    setAddrs((a.data as Addr[]) ?? []);
    setBonus(l.data?.balance ?? 0);
    setName(p.data?.full_name ?? '');
    setNotif(p.data?.notifications_enabled ?? true);
    // merge server + local favorites
    const server = (f.data ?? []).map((x) => x.product_id as string);
    const local = useApp.getState().favs;
    const merged = Array.from(new Set([...server, ...local]));
    useApp.getState().set({ favs: merged });
    const missing = local.filter((x) => !server.includes(x));
    if (missing.length) {
      const up = await sb().from('favorites').upsert(missing.map((product_id) => ({ user_id: uid, product_id })));
      if (up.error) toast(tRef.current('Не удалось синхронизировать избранное', 'Таңдаулыларды синхрондау мүмкін болмады'));
    }
  }, [uid]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  // keep server favorites in sync with toggles
  useEffect(() => {
    if (!uid) return;
    return useApp.subscribe((s, prev) => {
      if (s.favs === prev.favs) return;
      const added = s.favs.filter((x) => !prev.favs.includes(x));
      const removed = prev.favs.filter((x) => !s.favs.includes(x));
      if (added.length) sb().from('favorites').upsert(added.map((product_id) => ({ user_id: uid, product_id }))).then(({ error }) => { if (error) toast(tRef.current('Не удалось сохранить избранное', 'Таңдаулыны сақтау мүмкін болмады')); });
      removed.forEach((id) => sb().from('favorites').delete().eq('user_id', uid).eq('product_id', id).then(({ error }) => { if (error) toast(tRef.current('Не удалось обновить избранное', 'Таңдаулыны жаңарту мүмкін болмады')); }));
    });
  }, [uid]);

  if (!mounted || !session.ready) return <div style={{ padding: 60, textAlign: 'center' }}><Spinner dark /></div>;

  if (!session.user) {
    return (
      <div className="scr-in fl-page">
        <h1 className="disp fl-title">{t('Профиль', 'Профиль')}</h1>
        <div className="fl-card fl-card--o fl-empty" style={{ marginTop: 16, maxWidth: 520 }}>
          <div className="fl-empty__bolt" style={{ width: 88, height: 88, borderRadius: 26 }}><BoltMark size={52} /></div>
          <div className="disp" style={{ fontSize: 18, fontWeight: 800, marginTop: 18 }}>{t('Войдите, чтобы копить бонусы', 'Бонус жинау үшін кіріңіз')}</div>
          <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 8 }}>{t('История заказов, адреса и избранное.', 'Тапсырыстар тарихы, мекенжайлар және таңдаулылар.')}</div>
          <Link href="/auth?next=/profile" className="btn primary" style={{ display: 'inline-flex', alignItems: 'center', marginTop: 16, height: 52, padding: '0 28px', borderRadius: 26, fontSize: 15, textDecoration: 'none' }}>{t('Войти по номеру', 'Нөмір арқылы кіру')}</Link>
        </div>
      </div>
    );
  }

  const saveName = async () => {
    const { error } = await sb().from('profiles').update({ full_name: name.trim().slice(0, 80) || null }).eq('id', uid!);
    toast(error ? t('Не удалось сохранить', 'Сақтау мүмкін болмады') : t('Имя сохранено', 'Аты сақталды'));
  };
  const toggleNotif = async () => {
    const v = !notif;
    setNotif(v);
    const { error } = await sb().from('profiles').update({ notifications_enabled: v }).eq('id', uid!);
    if (error) { setNotif(!v); toast(t('Не удалось сохранить настройку', 'Баптауды сақтау мүмкін болмады')); }
  };
  const saveCurrentAddress = async () => {
    if (!app.address) return router.push('/map');
    const { error } = await sb().from('customer_addresses').insert({ user_id: uid, address_text: app.address.label, lat: app.address.lat, lon: app.address.lon, apartment: app.details.apt || null, entrance: app.details.ent || null, floor: app.details.floor || null, intercom: app.details.intercom || null });
    toast(error ? t('Не удалось сохранить адрес', 'Мекенжайды сақтау мүмкін болмады') : t('Адрес сохранён', 'Мекенжай сақталды'));
    if (!error) load();
  };
  const reorder = (o: OrderRow) => {
    let added = 0;
    o.order_items?.forEach((it) => {
      const p = products.find((x) => x.name === it.product_name);
      if (!p) return;
      const extraIds = it.extras.map((e) => e.id).filter((id) => catalogExtras.some((x) => x.id === id && x.groupId === p.extraGroupId));
      app.add({ productId: p.id, meat: it.meat as Meat, qty: it.quantity, extraIds });
      added++;
    });
    toast(added ? t('Заказ добавлен в корзину', 'Тапсырыс себетке қосылды') : t('Позиции больше недоступны', 'Позициялар енді қолжетімсіз'));
    if (added) router.push('/cart');
  };
  const itemName = (nm: string) => { const p = products.find((x) => x.name === nm); return p ? tx(p.name, p.nameKk) : nm; };
  const isStaff = session.roles.some((r) => r !== 'CUSTOMER');
  const favItems = products.filter((p) => app.favs.includes(p.id));
  const active = (orders ?? []).filter((o) => ACTIVE.includes(o.status));
  const history = (orders ?? []).filter((o) => !ACTIVE.includes(o.status));
  const delAddr = async (id: string) => {
    const { error } = await sb().from('customer_addresses').delete().eq('id', id);
    if (error) { toast(t('Не удалось удалить адрес', 'Мекенжайды жою мүмкін болмады')); return; }
    toast(t('Адрес удалён', 'Мекенжай жойылды'));
    load();
  };
  const pillLink = { display: 'flex', alignItems: 'center', textDecoration: 'none', minHeight: 44 } as const;
  const chipBtn = { minHeight: 44, padding: '0 14px', borderRadius: 14, background: '#FFF1E0', color: '#C24D00', fontWeight: 800, fontSize: 13 } as const;

  const orderCard = (o: OrderRow, isActive: boolean) => (
    <div key={o.id} className={'fl-order' + (isActive ? ' fl-order--act' : '')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="disp" style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>#TB-{o.order_no}</div>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: STATUS_COLOR[o.status], borderRadius: 12, padding: '4px 10px' }}>{statusLabel(o.status, lang)}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#4A423A', marginTop: 6, lineHeight: 1.4 }}>
        {o.order_items?.map((i) => `${itemName(i.product_name)}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')}
      </div>
      <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 700, marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>{dateShortL(o.created_at, locale)}</span>·<PriceTag amount={o.total_kzt} tone="ink" size={14} color="#141210" />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {isActive && <Link href={`/track/${o.id}`} className="btn primary" style={{ ...pillLink, padding: '0 18px', borderRadius: 22, fontSize: 14 }}>{t('Отследить', 'Бақылау')}</Link>}
        <button className="btn" onClick={() => reorder(o)} style={chipBtn}>{t('Повторить', 'Қайталау')}</button>
        <button className="btn" onClick={() => goTab('support', o.id)} style={{ ...chipBtn, background: '#F3EADF', color: '#141210' }}>{t('Вопрос по заказу', 'Тапсырыс бойынша сұрақ')}</button>
        {!isActive && <Link href={`/track/${o.id}`} className="btn" style={{ ...pillLink, ...chipBtn, background: '#F3EADF', color: '#141210' }}>{t('Детали', 'Толығырақ')}</Link>}
      </div>
    </div>
  );

  return (
    <div className="scr-in fl-page">
      <h1 className="disp fl-title only-desktop" style={{ marginBottom: 18 }}>{t('Профиль', 'Профиль')}</h1>
      <div className="fl-prof">
        <div className="fl-prof__side">
          <div className="fl-prof__who">
            <div aria-hidden className="fl-prof__ava"><BoltMark size={32} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="disp" style={{ fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name.trim() || t('Добро пожаловать!', 'Қош келдіңіз!')}</div>
              <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.8, marginTop: 2 }}>{session.phone ? formatPhone(session.phone) : '—'}</div>
            </div>
            <div style={{ textAlign: 'right', flex: 'none' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#FF6A0A', letterSpacing: '.1em' }}>TOK CLUB</div>
              <div className="disp" style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>{bonus}</div>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.75 }}>{t('бонусов', 'бонус')}</div>
            </div>
          </div>

          {isStaff && (
            <div className="fl-prof__staff">
              {(session.roles.includes('ADMIN') || session.roles.includes('MODERATOR')) && <Link href={session.roles.includes('ADMIN') ? '/admin' : '/admin/orders'} className="btn dark pill" style={pillLink}>{t('Админ-панель', 'Әкімші панелі')}</Link>}
              {(session.roles.includes('KITCHEN') || session.roles.includes('OPERATOR') || session.roles.includes('ADMIN')) && <Link href="/kitchen" className="btn dark pill" style={pillLink}>{t('Кухня', 'Асхана')}</Link>}
              {session.roles.includes('COURIER') && <Link href="/courier" className="btn dark pill" style={pillLink}>{t('Курьер', 'Курьер')}</Link>}
            </div>
          )}

          <div className="fl-tabs-wrap">
            <div role="tablist" aria-label={t('Разделы профиля', 'Профиль бөлімдері')} className="fl-tabs">
              {TABS.map((x) => (
                <button key={x.id} role="tab" aria-selected={x.id === tab} id={`tab-${x.id}`} aria-controls="profile-panel" onClick={() => goTab(x.id)} className="btn fl-tab">
                  {x.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div id="profile-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="fl-prof__main">
          {tab === 'orders' && (
            <div>
              {orders === null ? <div style={{ marginTop: 20, textAlign: 'center' }}><Spinner dark /></div> : !orders.length ? (
                <div className="fl-card fl-card--o fl-empty" style={{ marginTop: 10 }}>
                  <div className="fl-empty__bolt" style={{ width: 88, height: 88, borderRadius: 26 }}><BoltMark size={52} /></div>
                  <div className="disp" style={{ fontSize: 17, fontWeight: 800, marginTop: 16 }}>{t('Пока нет заказов', 'Әзірге тапсырыс жоқ')}</div>
                  <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>{t('Самое время попробовать наши бургеры.', 'Біздің бургерлерді татып көретін уақыт.')}</div>
                  <Link href="/menu" className="btn primary" style={{ ...pillLink, display: 'inline-flex', marginTop: 14, padding: '0 26px', borderRadius: 26 }}>{t('Выбрать бургер', 'Бургер таңдау')}</Link>
                </div>
              ) : (
                <div className="fl-orders">
                  {active.length > 0 && <div className="fl-cap" style={{ marginTop: 4 }}>{t('АКТИВНЫЕ', 'БЕЛСЕНДІ')}</div>}
                  {active.map((o) => orderCard(o, true))}
                  {history.length > 0 && <div className="fl-cap" style={{ marginTop: 6 }}>{t('ИСТОРИЯ', 'ТАРИХ')}</div>}
                  {history.map((o) => orderCard(o, false))}
                </div>
              )}
            </div>
          )}

          {tab === 'data' && (
            <div className="fl-data">
              <div className="fl-card">
                <div className="fl-cap">{t('ТЕЛЕФОН', 'ТЕЛЕФОН')}</div>
                <div style={{ fontWeight: 800, fontSize: 16, marginTop: 2 }}>{session.phone ? formatPhone(session.phone) : '—'}</div>
                <div className="fl-cap" style={{ marginTop: 12 }}>{t('ИМЯ', 'АТЫ')}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Как к вам обращаться', 'Сізге қалай жүгінуге болады')} aria-label={t('Имя', 'Аты')} />
                  <button className="btn dark" onClick={saveName} aria-label={t('Сохранить имя', 'Атын сақтау')} style={{ height: 48, padding: '0 16px', borderRadius: 14 }}>OK</button>
                </div>
              </div>
              <div className="fl-card">
                <div className="fl-langrow">
                  <h2 className="disp fl-h">{t('Язык', 'Тіл')} / {t('Тіл', 'Язык')}</h2>
                  <LangSwitch />
                </div>
              </div>
              <button className="btn fl-card" onClick={toggleNotif} role="switch" aria-checked={notif} style={{ width: '100%', padding: 16, display: 'flex', alignItems: 'center', textAlign: 'left', minHeight: 56 }}>
                <span style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>{t('Уведомления о заказе', 'Тапсырыс туралы хабарламалар')}</span>
                <span style={{ width: 48, height: 28, borderRadius: 14, background: notif ? '#FF6A0A' : '#CFC4B5', position: 'relative', flex: 'none' }}><span style={{ position: 'absolute', top: 3, left: notif ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} /></span>
              </button>
              <div className="fl-card">
                <h2 className="disp fl-h">{t('Избранное', 'Таңдаулылар')}</h2>
                {!favItems.length ? <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>{t('Нажмите на сердечко у бургера.', 'Бургердегі жүрекшені басыңыз.')}</div>
                  : favItems.map((f) => <Link key={f.id} href={`/product/${f.slug}`} className="btn" style={{ display: 'flex', alignItems: 'center', minHeight: 44, fontWeight: 800, fontSize: 14, marginTop: 6, textDecoration: 'none' }}>{tx(f.name, f.nameKk)} →</Link>)}
              </div>
              <button className="btn fl-wide" onClick={async () => { await signOut(); toast(t('Вы вышли', 'Сіз шықтыңыз')); router.push('/'); }} style={{ width: '100%', minHeight: 52, borderRadius: 22, background: '#F3EADF', color: '#B3261E', fontWeight: 800, fontSize: 15 }}>{t('Выйти', 'Шығу')}</button>
            </div>
          )}

          {tab === 'addresses' && (
            <div className="fl-card" style={{ marginTop: 10 }}>
              <h2 className="disp fl-h">{t('Сохранённые адреса', 'Сақталған мекенжайлар')}</h2>
              {!addrs.length && <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>{t('Адресов пока нет.', 'Мекенжайлар әзірге жоқ.')}</div>}
              {addrs.map((a) => (
                <div key={a.id} className="fl-addr-row">
                  <button className="btn" onClick={() => { app.set({ address: { lat: a.lat, lon: a.lon, label: a.address_text }, mode: 'DELIVERY' }); toast(t('Адрес выбран', 'Мекенжай таңдалды')); }} aria-label={`${t('Выбрать адрес', 'Мекенжайды таңдау')} ${a.address_text}`} style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 700, color: '#4A423A', minHeight: 44 }}>{a.address_text}{a.apartment ? t(', кв. ', ', пәтер ') + a.apartment : ''}</button>
                  <button className="btn" aria-label={t('Удалить адрес', 'Мекенжайды жою')} onClick={() => delAddr(a.id)} style={{ width: 44, height: 44, color: '#8A7F73' }}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {app.address && <button className="btn" onClick={saveCurrentAddress} style={chipBtn}>+ {t('Сохранить', 'Сақтау')} «{app.address.label}»</button>}
                <Link href="/map" className="btn" style={{ ...pillLink, ...chipBtn }}>{t('Выбрать на карте', 'Картадан таңдау')}</Link>
              </div>
            </div>
          )}

          {tab === 'support' && (
            <div className="fl-card" style={{ marginTop: 10 }}>
              <SupportCenter key={supportOrder ?? 'none'} kind="CUSTOMER" initialOrderId={supportOrder} wide />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense>
      <Profile />
    </Suspense>
  );
}

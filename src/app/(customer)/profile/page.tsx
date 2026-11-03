'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { Spinner, toast } from '@/components/ui';
import { useMounted } from '@/features/catalog/hooks';
import { SupportCenter } from '@/features/support/SupportCenter';
import { ACTIVE, dateShort, STATUS_COLOR, STATUS_LABEL } from '@/features/orders/status';
import { signOut, useSession } from '@/hooks/useSession';
import { useApp } from '@/stores/app';
import { fmt } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { sb } from '@/lib/supabase/client';
import type { Meat, OrderRow } from '@/types/catalog';

type Tab = 'orders' | 'data' | 'addresses' | 'support';
const TABS: { id: Tab; label: string }[] = [
  { id: 'orders', label: 'Мои заказы' }, { id: 'data', label: 'Данные' }, { id: 'addresses', label: 'Адреса' }, { id: 'support', label: 'Поддержка' },
];

interface Addr { id: string; label: string | null; address_text: string; lat: number; lon: number; apartment: string | null }

function Profile() {
  const router = useRouter();
  const sp = useSearchParams();
  const session = useSession();
  const mounted = useMounted();
  const { products, extras: catalogExtras } = useCatalog();
  const app = useApp();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [addrs, setAddrs] = useState<Addr[]>([]);
  const [bonus, setBonus] = useState(0);
  const [name, setName] = useState('');
  const [notif, setNotif] = useState(true);
  const rawTab = sp.get('tab');
  const supportOrder = sp.get('order') ?? sp.get('support');
  const tab: Tab = TABS.some((t) => t.id === rawTab) ? (rawTab as Tab) : supportOrder ? 'support' : 'orders';
  const goTab = (t: Tab, order?: string) => router.replace(`/profile?tab=${t}${order ? `&order=${order}` : ''}`, { scroll: false });
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
    if (o.error || a.error || l.error || p.error || f.error) toast('Не удалось загрузить часть данных профиля');
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
      if (up.error) toast('Не удалось синхронизировать избранное');
    }
  }, [uid]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // keep server favorites in sync with toggles
  useEffect(() => {
    if (!uid) return;
    return useApp.subscribe((s, prev) => {
      if (s.favs === prev.favs) return;
      const added = s.favs.filter((x) => !prev.favs.includes(x));
      const removed = prev.favs.filter((x) => !s.favs.includes(x));
      if (added.length) sb().from('favorites').upsert(added.map((product_id) => ({ user_id: uid, product_id }))).then(({ error }) => { if (error) toast('Не удалось сохранить избранное'); });
      removed.forEach((id) => sb().from('favorites').delete().eq('user_id', uid).eq('product_id', id).then(({ error }) => { if (error) toast('Не удалось обновить избранное'); }));
    });
  }, [uid]);

  if (!mounted || !session.ready) return <div style={{ padding: 60, textAlign: 'center' }}><Spinner dark /></div>;

  if (!session.user) {
    return (
      <div className="scr-in" style={{ padding: 16 }}>
        <h1 className="disp" style={{ fontSize: 24, fontWeight: 800 }}>Профиль</h1>
        <div style={{ marginTop: 16, background: '#fff', borderRadius: 24, padding: 24, textAlign: 'center' }}>
          <div className="disp" style={{ fontSize: 18, fontWeight: 800 }}>Войдите, чтобы копить бонусы</div>
          <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 8 }}>История заказов, адреса и избранное.</div>
          <Link href="/auth?next=/profile" className="btn primary" style={{ display: 'inline-flex', alignItems: 'center', marginTop: 16, height: 52, padding: '0 28px', borderRadius: 26, fontSize: 15, textDecoration: 'none' }}>Войти по номеру</Link>
        </div>
      </div>
    );
  }

  const saveName = async () => {
    const { error } = await sb().from('profiles').update({ full_name: name.trim().slice(0, 80) || null }).eq('id', uid!);
    toast(error ? 'Не удалось сохранить' : 'Имя сохранено');
  };
  const toggleNotif = async () => {
    const v = !notif;
    setNotif(v);
    const { error } = await sb().from('profiles').update({ notifications_enabled: v }).eq('id', uid!);
    if (error) { setNotif(!v); toast('Не удалось сохранить настройку'); }
  };
  const saveCurrentAddress = async () => {
    if (!app.address) return router.push('/map');
    const { error } = await sb().from('customer_addresses').insert({ user_id: uid, address_text: app.address.label, lat: app.address.lat, lon: app.address.lon, apartment: app.details.apt || null, entrance: app.details.ent || null, floor: app.details.floor || null, intercom: app.details.intercom || null });
    toast(error ? 'Не удалось сохранить адрес' : 'Адрес сохранён');
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
    toast(added ? 'Заказ добавлен в корзину' : 'Позиции больше недоступны');
    if (added) router.push('/cart');
  };
  const isStaff = session.roles.some((r) => r !== 'CUSTOMER');
  const favItems = products.filter((p) => app.favs.includes(p.id));
  const active = (orders ?? []).filter((o) => ACTIVE.includes(o.status));
  const history = (orders ?? []).filter((o) => !ACTIVE.includes(o.status));
  const delAddr = async (id: string) => {
    const { error } = await sb().from('customer_addresses').delete().eq('id', id);
    if (error) { toast('Не удалось удалить адрес'); return; }
    toast('Адрес удалён');
    load();
  };
  const pillLink = { display: 'flex', alignItems: 'center', textDecoration: 'none', minHeight: 44 } as const;
  const chipBtn = { minHeight: 44, padding: '0 14px', borderRadius: 14, background: '#FFF1E0', color: '#C24D00', fontWeight: 800, fontSize: 13 } as const;
  const cap = { fontSize: 12, fontWeight: 800, color: '#6B6258' } as const;

  const orderCard = (o: OrderRow, isActive: boolean) => (
    <div key={o.id} style={{ marginTop: 10, background: '#fff', borderRadius: 24, padding: 14, boxShadow: isActive ? '0 8px 22px rgba(255,106,10,.18)' : '0 2px 10px rgba(20,18,16,.05)', border: isActive ? '2px solid #FF6A0A' : '2px solid transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="disp" style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>#TB-{o.order_no}</div>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: STATUS_COLOR[o.status], borderRadius: 12, padding: '4px 10px' }}>{STATUS_LABEL[o.status]}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#4A423A', marginTop: 6, lineHeight: 1.4 }}>
        {o.order_items?.map((i) => `${i.product_name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')}
      </div>
      <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 700, marginTop: 6 }}>{dateShort(o.created_at)} · <b style={{ color: '#141210' }}>{fmt(o.total_kzt)}</b></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {isActive && <Link href={`/track/${o.id}`} className="btn primary" style={{ ...pillLink, padding: '0 18px', borderRadius: 22, fontSize: 14 }}>Отследить</Link>}
        <button className="btn" onClick={() => reorder(o)} style={chipBtn}>Повторить</button>
        <button className="btn" onClick={() => goTab('support', o.id)} style={{ ...chipBtn, background: '#F3EADF', color: '#141210' }}>Вопрос по заказу</button>
        {!isActive && <Link href={`/track/${o.id}`} className="btn" style={{ ...pillLink, ...chipBtn, background: '#F3EADF', color: '#141210' }}>Детали</Link>}
      </div>
    </div>
  );

  return (
    <div className="scr-in" style={{ padding: 16 }}>
      <div style={{ background: '#141210', color: '#fff', borderRadius: 28, padding: 16, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 10px 26px rgba(20,18,16,.22)' }}>
        <div aria-hidden style={{ width: 48, height: 48, borderRadius: '50%', background: '#FF6A0A', display: 'grid', placeItems: 'center', fontSize: 22, flex: 'none' }}>🍔</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="disp" style={{ fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name.trim() || 'Қош келдіңіз!'}</div>
          <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.8, marginTop: 2 }}>{session.phone ? formatPhone(session.phone) : '—'}</div>
        </div>
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#FF6A0A', letterSpacing: '.1em' }}>TOK CLUB</div>
          <div className="disp" style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>{bonus}</div>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.75 }}>бонусов</div>
        </div>
      </div>

      {isStaff && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(session.roles.includes('ADMIN') || session.roles.includes('MODERATOR')) && <Link href={session.roles.includes('ADMIN') ? '/admin' : '/admin/orders'} className="btn dark pill" style={pillLink}>Админ-панель</Link>}
          {(session.roles.includes('KITCHEN') || session.roles.includes('OPERATOR') || session.roles.includes('ADMIN')) && <Link href="/kitchen" className="btn dark pill" style={pillLink}>Кухня</Link>}
          {session.roles.includes('COURIER') && <Link href="/courier" className="btn dark pill" style={pillLink}>Курьер</Link>}
        </div>
      )}

      <div style={{ position: 'sticky', top: 0, zIndex: 5, marginTop: 12, padding: '6px 0', background: '#FFF6EC' }}>
        <div role="tablist" aria-label="Разделы профиля" style={{ display: 'flex', gap: 4, background: '#F3EADF', borderRadius: 24, padding: 4 }}>
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button key={t.id} role="tab" aria-selected={on} id={`tab-${t.id}`} aria-controls="profile-panel" onClick={() => goTab(t.id)} className="btn"
                style={{ flex: 1, minHeight: 44, borderRadius: 20, padding: '0 4px', fontSize: 12.5, fontWeight: 800, background: on ? '#FF6A0A' : 'transparent', color: on ? '#fff' : '#4A423A', boxShadow: on ? '0 4px 12px rgba(255,106,10,.35)' : 'none' }}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div id="profile-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'orders' && (
          <div>
            {orders === null ? <div style={{ marginTop: 20, textAlign: 'center' }}><Spinner dark /></div> : !orders.length ? (
              <div style={{ marginTop: 10, background: '#fff', borderRadius: 24, padding: 24, textAlign: 'center' }}>
                <div className="disp" style={{ fontSize: 17, fontWeight: 800 }}>Пока нет заказов</div>
                <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>Самое время попробовать наши бургеры.</div>
                <Link href="/menu" className="btn primary" style={{ ...pillLink, display: 'inline-flex', marginTop: 14, padding: '0 26px', borderRadius: 26 }}>Выбрать бургер</Link>
              </div>
            ) : (
              <>
                {active.length > 0 && <div style={{ ...cap, marginTop: 14 }}>АКТИВНЫЕ</div>}
                {active.map((o) => orderCard(o, true))}
                {history.length > 0 && <div style={{ ...cap, marginTop: 16 }}>ИСТОРИЯ</div>}
                {history.map((o) => orderCard(o, false))}
              </>
            )}
          </div>
        )}

        {tab === 'data' && (
          <div>
            <div className="card" style={{ marginTop: 10 }}>
              <div style={cap}>ТЕЛЕФОН</div>
              <div style={{ fontWeight: 800, fontSize: 16, marginTop: 2 }}>{session.phone ? formatPhone(session.phone) : '—'}</div>
              <div style={{ ...cap, marginTop: 12 }}>ИМЯ</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" aria-label="Имя" />
                <button className="btn dark" onClick={saveName} style={{ height: 48, padding: '0 16px', borderRadius: 14 }}>OK</button>
              </div>
            </div>
            <button className="btn" onClick={toggleNotif} role="switch" aria-checked={notif} style={{ marginTop: 12, width: '100%', background: '#fff', borderRadius: 22, padding: 16, display: 'flex', alignItems: 'center', textAlign: 'left', minHeight: 56 }}>
              <span style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>Уведомления о заказе</span>
              <span style={{ width: 48, height: 28, borderRadius: 14, background: notif ? '#FF6A0A' : '#CFC4B5', position: 'relative' }}><span style={{ position: 'absolute', top: 3, left: notif ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} /></span>
            </button>
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Избранное</div>
              {!favItems.length ? <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>Нажмите на сердечко у бургера.</div>
                : favItems.map((f) => <Link key={f.id} href={`/product/${f.slug}`} className="btn" style={{ display: 'flex', alignItems: 'center', minHeight: 44, fontWeight: 800, fontSize: 14, marginTop: 6, textDecoration: 'none' }}>{f.name} →</Link>)}
            </div>
            <button className="btn" onClick={async () => { await signOut(); toast('Вы вышли'); router.push('/'); }} style={{ marginTop: 12, width: '100%', minHeight: 52, borderRadius: 22, background: '#F3EADF', color: '#B3261E', fontWeight: 800, fontSize: 15 }}>Выйти</button>
          </div>
        )}

        {tab === 'addresses' && (
          <div className="card" style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Сохранённые адреса</div>
            {!addrs.length && <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>Адресов пока нет.</div>}
            {addrs.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <button className="btn" onClick={() => { app.set({ address: { lat: a.lat, lon: a.lon, label: a.address_text }, mode: 'DELIVERY' }); toast('Адрес выбран'); }} aria-label={`Выбрать адрес ${a.address_text}`} style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 700, color: '#4A423A', minHeight: 44 }}>{a.address_text}{a.apartment ? ', кв. ' + a.apartment : ''}</button>
                <button className="btn" aria-label="Удалить адрес" onClick={() => delAddr(a.id)} style={{ width: 44, height: 44, color: '#8A7F73' }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {app.address && <button className="btn" onClick={saveCurrentAddress} style={chipBtn}>+ Сохранить «{app.address.label}»</button>}
              <Link href="/map" className="btn" style={{ ...pillLink, ...chipBtn }}>Выбрать на карте</Link>
            </div>
          </div>
        )}

        {tab === 'support' && (
          <div className="card" style={{ marginTop: 10 }}>
            <SupportCenter key={supportOrder ?? 'none'} kind="CUSTOMER" initialOrderId={supportOrder} />
          </div>
        )}
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

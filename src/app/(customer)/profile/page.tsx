'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { Spinner, toast } from '@/components/ui';
import { useMounted } from '@/features/catalog/hooks';
import { dateShort, STATUS_COLOR, STATUS_LABEL } from '@/features/orders/status';
import { signOut, useSession } from '@/hooks/useSession';
import { useApp } from '@/stores/app';
import { fmt } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { sb } from '@/lib/supabase/client';
import type { Meat, OrderRow } from '@/types/catalog';

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
  const [support, setSupport] = useState(sp.get('support') ? '' : null as string | null);
  const [sending, setSending] = useState(false);
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
    if (missing.length) await sb().from('favorites').upsert(missing.map((product_id) => ({ user_id: uid, product_id })));
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
      if (added.length) sb().from('favorites').upsert(added.map((product_id) => ({ user_id: uid, product_id })));
      removed.forEach((id) => sb().from('favorites').delete().eq('user_id', uid).eq('product_id', id));
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
    await sb().from('profiles').update({ notifications_enabled: v }).eq('id', uid!);
  };
  const saveCurrentAddress = async () => {
    if (!app.address) return router.push('/map');
    const { error } = await sb().from('customer_addresses').insert({ user_id: uid, address_text: app.address.label, lat: app.address.lat, lon: app.address.lon, apartment: app.details.apt || null, entrance: app.details.ent || null, floor: app.details.floor || null, intercom: app.details.intercom || null });
    toast(error ? 'Не удалось сохранить адрес' : 'Адрес сохранён');
    load();
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
  const sendSupport = async () => {
    if (!support?.trim()) return;
    setSending(true);
    const { error } = await sb().from('support_requests').insert({ user_id: uid, message: support.trim().slice(0, 2000), order_id: sp.get('support') || null });
    setSending(false);
    if (error) return toast('Не удалось отправить');
    setSupport(null);
    toast('Обращение отправлено. Мы свяжемся с вами');
  };
  const isStaff = session.roles.some((r) => r !== 'CUSTOMER');
  const favItems = products.filter((p) => app.favs.includes(p.id));

  return (
    <div className="scr-in" style={{ padding: 16 }}>
      <h1 className="disp" style={{ fontSize: 24, fontWeight: 800 }}>Профиль</h1>
      <div style={{ marginTop: 14, background: '#141210', color: '#fff', borderRadius: 26, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#FF6A0A', letterSpacing: '.1em' }}>TOK CLUB</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}><div className="disp" style={{ fontSize: 36, fontWeight: 800 }}>{bonus}</div><div style={{ fontSize: 14, opacity: 0.8, fontWeight: 700 }}>бонусов</div></div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8, fontWeight: 600 }}>Правила начисления бонусов настраивает ресторан.</div>
      </div>

      {isStaff && (
        <div className="card" style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {session.roles.includes('ADMIN') && <Link href="/admin" className="btn dark pill" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>Админ-панель</Link>}
          {(session.roles.includes('KITCHEN') || session.roles.includes('OPERATOR') || session.roles.includes('ADMIN')) && <Link href="/kitchen" className="btn dark pill" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>Кухня</Link>}
          {session.roles.includes('COURIER') && <Link href="/courier" className="btn dark pill" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>Курьер</Link>}
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#6B6258' }}>ТЕЛЕФОН</div>
        <div style={{ fontWeight: 800, fontSize: 16, marginTop: 2 }}>{session.phone ? formatPhone(session.phone) : '—'}</div>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#6B6258', marginTop: 12 }}>ИМЯ</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" aria-label="Имя" />
          <button className="btn dark" onClick={saveName} style={{ height: 48, padding: '0 16px', borderRadius: 14 }}>OK</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Сохранённые адреса</div>
        {addrs.map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <button className="btn" onClick={() => { app.set({ address: { lat: a.lat, lon: a.lon, label: a.address_text }, mode: 'DELIVERY' }); toast('Адрес выбран'); }} style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 700, color: '#4A423A', minHeight: 44 }}>{a.address_text}{a.apartment ? ', кв. ' + a.apartment : ''}</button>
            <button className="btn" aria-label="Удалить адрес" onClick={async () => { await sb().from('customer_addresses').delete().eq('id', a.id); load(); }} style={{ width: 44, height: 44, color: '#8A7F73' }}>✕</button>
          </div>
        ))}
        <button className="btn" onClick={saveCurrentAddress} style={{ marginTop: 10, minHeight: 44, padding: '0 14px', borderRadius: 14, background: '#FFF1E0', color: '#C24D00', fontWeight: 800, fontSize: 13 }}>
          {app.address ? `+ Сохранить «${app.address.label}»` : '+ Выбрать адрес на карте'}
        </button>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>История заказов</div>
        {orders === null ? <div style={{ marginTop: 10 }}><Spinner dark /></div> : !orders.length ? (
          <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>Заказов пока нет.</div>
        ) : orders.map((o) => (
          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <Link href={`/track/${o.id}`} style={{ flex: 1, textDecoration: 'none', minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>#TB-{o.order_no} · {o.order_items?.map((i) => i.product_name).join(', ')}</div>
              <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 700 }}>{dateShort(o.created_at)} · {fmt(o.total_kzt)} · <span style={{ color: STATUS_COLOR[o.status] }}>{STATUS_LABEL[o.status]}</span></div>
            </Link>
            <button className="btn" onClick={() => reorder(o)} style={{ minHeight: 44, padding: '0 14px', borderRadius: 14, background: '#FFF1E0', color: '#C24D00', fontWeight: 800, fontSize: 13 }}>Повторить</button>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Избранное</div>
        {!favItems.length ? <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>Нажмите на сердечко у бургера.</div>
          : favItems.map((f) => <Link key={f.id} href={`/product/${f.slug}`} className="btn" style={{ display: 'flex', alignItems: 'center', minHeight: 44, fontWeight: 800, fontSize: 14, marginTop: 6, textDecoration: 'none' }}>{f.name} →</Link>)}
      </div>

      <button className="btn" onClick={toggleNotif} role="switch" aria-checked={notif} style={{ marginTop: 12, width: '100%', background: '#fff', borderRadius: 22, padding: 16, display: 'flex', alignItems: 'center', textAlign: 'left', minHeight: 56 }}>
        <span style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>Уведомления о заказе</span>
        <span style={{ width: 48, height: 28, borderRadius: 14, background: notif ? '#FF6A0A' : '#CFC4B5', position: 'relative' }}><span style={{ position: 'absolute', top: 3, left: notif ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} /></span>
      </button>

      {support === null ? (
        <button className="btn" onClick={() => setSupport('')} style={{ marginTop: 12, width: '100%', background: '#fff', borderRadius: 22, padding: 16, textAlign: 'left', fontWeight: 800, fontSize: 15, minHeight: 56 }}>Поддержка</button>
      ) : (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Поддержка {sp.get('support') ? '· по заказу' : ''}</div>
          <textarea value={support} onChange={(e) => setSupport(e.target.value)} rows={4} placeholder="Опишите вопрос" aria-label="Сообщение в поддержку" className="field" style={{ height: 'auto', padding: 12, marginTop: 10, resize: 'vertical' }} />
          <button className="btn primary" onClick={sendSupport} disabled={sending} style={{ marginTop: 10, width: '100%', height: 48, borderRadius: 24 }}>{sending ? <Spinner /> : 'Отправить'}</button>
        </div>
      )}
      <button className="btn" onClick={async () => { await signOut(); toast('Вы вышли'); router.push('/'); }} style={{ marginTop: 12, width: '100%', minHeight: 52, borderRadius: 22, background: '#F3EADF', color: '#B3261E', fontWeight: 800, fontSize: 15 }}>Выйти</button>
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

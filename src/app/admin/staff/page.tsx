'use client';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { OnlineBadge } from '@/components/admin/CourierPanels';
import { Badge, Label, PageHead, Panel, PhoneInput, TableWrap, Toggle, useAdminBranches } from '@/components/admin/kit';
import { Spinner, toast } from '@/components/ui';
import { type LiveCourier, dispatchErr, useLiveCouriers } from '@/features/admin/couriers';
import { errText } from '@/features/admin/transitions';
import { formatPhone } from '@/lib/phone';
import { sb } from '@/lib/supabase/client';

type StaffRole = 'ADMIN' | 'MODERATOR' | 'KITCHEN' | 'OPERATOR' | 'COURIER';
interface Invite { id: string; phone: string; role: StaffRole; branch_id: string | null; display_name: string | null; created_at: string }

const ROLE_LABEL: Record<StaffRole, string> = { ADMIN: 'Администратор', MODERATOR: 'Модератор', KITCHEN: 'Кухня', OPERATOR: 'Оператор', COURIER: 'Курьер' };
const ROLE_PERM: Record<StaffRole, string> = { ADMIN: 'Полный доступ', MODERATOR: 'Заказы и поддержка', KITCHEN: 'Заказы своего филиала', OPERATOR: 'Заказы своего филиала', COURIER: 'Доставки' };
const ROLE_COLOR: Record<StaffRole, string> = { ADMIN: '#141210', MODERATOR: '#0B8F6A', KITCHEN: '#C24D00', OPERATOR: '#0B6EE5', COURIER: '#7B3FE4' };

const inviteSchema = z.object({
  phone: z.string().regex(/^7\d{9}$/, 'Введите 10 цифр номера после +7'),
  role: z.enum(['ADMIN', 'MODERATOR', 'KITCHEN', 'OPERATOR', 'COURIER']),
  branch: z.string(),
  name: z.string().trim().max(60),
}).refine((d) => !['KITCHEN', 'OPERATOR'].includes(d.role) || d.branch !== '', { message: 'Для кухни и оператора выберите филиал' });

const smallBtn: React.CSSProperties = { minHeight: 40, padding: '0 12px', borderRadius: 12, background: '#F3EADF', fontWeight: 800, fontSize: 13 };

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(20,18,16,.45)' }} />
      <div style={{ position: 'relative', width: 'min(420px, 100%)', background: '#fff', borderRadius: 20, padding: 24, boxSizing: 'border-box' }}>
        <div className="disp" style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

const PHONE_ERR: Record<string, string> = {
  PHONE_TAKEN: 'Номер уже используется', BAD_PHONE: 'Неверный формат номера', NOT_STAFF: 'Сотрудник не найден', FORBIDDEN: 'Нет доступа',
};

function PhoneModal({ who, onClose, onDone }: { who: { phone: string; name: string }; onClose: () => void; onDone: () => void }) {
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    if (!/^\d{10}$/.test(digits)) { setErr('Введите 10 цифр номера после +7'); return; }
    setErr(''); setBusy(true);
    const { error } = await sb().rpc('admin_change_staff_phone', { p_old: who.phone, p_new: '+7' + digits });
    setBusy(false);
    if (error) {
      const k = Object.keys(PHONE_ERR).find((x) => error.message.includes(x));
      const m = k ? PHONE_ERR[k] : errText(error.message);
      setErr(m); toast(m);
      return;
    }
    toast('Номер изменён');
    onDone();
  };
  return (
    <Modal title="Изменить номер" onClose={onClose}>
      <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 700, marginTop: 6 }}>{who.name} · сейчас {formatPhone(who.phone)}</div>
      <Label>НОВЫЙ НОМЕР</Label>
      <PhoneInput value={digits} onChange={setDigits} />
      <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 8 }}>Сотрудник войдёт по новому номеру через WhatsApp-код</div>
      {err && <div role="alert" style={{ color: '#B3261E', fontWeight: 700, fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onClose} style={{ flex: 1, height: 48, borderRadius: 24, background: '#F3EADF', fontWeight: 800 }}>Отмена</button>
        <button className="btn primary" disabled={busy} onClick={save} style={{ flex: 1, height: 48, borderRadius: 24 }}>{busy ? <Spinner /> : 'Сохранить'}</button>
      </div>
    </Modal>
  );
}

function NameModal({ who, onClose, onDone }: { who: { phone: string; name: string }; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(who.name);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const v = name.trim().slice(0, 60);
    setBusy(true);
    const { data, error } = await sb().from('staff_invites').update({ display_name: v || null }).eq('phone', who.phone).select('id');
    setBusy(false);
    if (error) return toast(errText(error.message));
    if (!data?.length) return toast('Не удалось сохранить имя');
    toast('Имя сохранено');
    onDone();
  };
  return (
    <Modal title="Имя сотрудника" onClose={onClose}>
      <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 700, marginTop: 6 }}>{formatPhone(who.phone)}</div>
      <Label>ИМЯ</Label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Имя сотрудника" aria-label="Имя сотрудника" />
      <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 8 }}>Это имя видно в истории заказов и в поддержке.</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onClose} style={{ flex: 1, height: 48, borderRadius: 24, background: '#F3EADF', fontWeight: 800 }}>Отмена</button>
        <button className="btn primary" disabled={busy} onClick={save} style={{ flex: 1, height: 48, borderRadius: 24 }}>{busy ? <Spinner /> : 'Сохранить'}</button>
      </div>
    </Modal>
  );
}

export default function AdminStaff() {
  const branches = useAdminBranches();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [registered, setRegistered] = useState<Record<string, string | null>>({});
  const live = useLiveCouriers(false);
  const couriers = live.couriers;
  const [f, setF] = useState({ phone: '', role: 'KITCHEN' as StaffRole, branch: '', name: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [phoneEdit, setPhoneEdit] = useState<{ phone: string; name: string } | null>(null);
  const [nameEdit, setNameEdit] = useState<{ phone: string; name: string } | null>(null);

  const load = useCallback(async () => {
    const i = await sb().from('staff_invites').select('id,phone,role,branch_id,display_name,created_at').order('created_at', { ascending: false });
    if (i.error) toast(errText(i.error.message));
    const inv = (i.data as Invite[]) ?? [];
    setInvites(inv);
    const phones = Array.from(new Set(inv.map((x) => x.phone)));
    const pr = phones.length ? await sb().from('profiles').select('id,phone,full_name').in('phone', phones) : { data: [], error: null };
    if (pr.error) toast(errText(pr.error.message));
    const reg: Record<string, string | null> = {};
    ((pr.data ?? []) as { phone: string; full_name: string | null }[]).forEach((p) => { reg[p.phone] = p.full_name; });
    setRegistered(reg);
  }, []);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const invite = async () => {
    const p = inviteSchema.safeParse(f);
    if (!p.success) { setErr(p.error.issues[0].message); return; }
    setErr(''); setBusy(true);
    const needsBranch = f.role === 'KITCHEN' || f.role === 'OPERATOR';
    const { error } = await sb().rpc('admin_invite_staff', { p_phone: '+7' + f.phone, p_role: f.role, p_branch: needsBranch ? f.branch : null, p_name: f.name.trim() || null });
    setBusy(false);
    if (error) return setErr(errText(error.message));
    toast('Доступ выдан. Сотрудник входит по своему номеру через WhatsApp-код');
    setF({ ...f, phone: '', name: '' });
    load();
  };

  const revoke = async (i: Invite) => {
    if (!confirm(`Снять роль «${ROLE_LABEL[i.role]}» с ${formatPhone(i.phone)}?`)) return;
    const { error } = await sb().rpc('admin_revoke_staff', { p_invite: i.id });
    if (error) return toast(dispatchErr(error.message));
    toast('Доступ отозван');
    load();
    live.reload();
  };

  const setCourierActive = async (c: LiveCourier, v: boolean) => {
    const { error } = await sb().rpc('admin_set_courier_active', { p_user: c.user_id, p_active: v });
    if (error) return toast(dispatchErr(error.message));
    toast(v ? 'Курьер активен' : 'Курьер отключён — не получит новые заказы');
    live.reload();
  };

  const groups = (() => {
    const m = new Map<string, Invite[]>();
    (invites ?? []).forEach((x) => m.set(x.phone, [...(m.get(x.phone) ?? []), x]));
    return Array.from(m.entries());
  })();

  const brName = (id: string | null) => (id ? branches.find((b) => b.id === id)?.short_name ?? '—' : 'Все');
  const needsBranch = f.role === 'KITCHEN' || f.role === 'OPERATOR';

  return (
    <>
      <PageHead title="Сотрудники и роли" />
      <Panel style={{ marginTop: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Выдать доступ сотруднику</div>
        <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 4 }}>Сотрудник входит на сайт по своему номеру (код в WhatsApp). Работники регистрируются только администратором. Роль применяется автоматически — сразу или при первом входе.</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ width: 220 }}><Label>ТЕЛЕФОН</Label><PhoneInput value={f.phone} onChange={(phone) => setF({ ...f, phone })} /></div>
          <div style={{ width: 180 }}><Label>РОЛЬ</Label>
            <select className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as StaffRole })}>
              {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          {needsBranch && (
            <div style={{ width: 180 }}><Label>ФИЛИАЛ</Label>
              <select className="field" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}>
                <option value="">Выберите…</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.short_name}</option>)}
              </select>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 160 }}><Label>ИМЯ (необязательно)</Label><input className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Имя сотрудника" /></div>
          <button className="btn primary" disabled={busy} onClick={invite} style={{ height: 48, padding: '0 24px', borderRadius: 24 }}>{busy ? <Spinner /> : 'Выдать доступ'}</button>
        </div>
        {err && <div role="alert" style={{ color: '#B3261E', fontWeight: 700, fontSize: 13, marginTop: 10 }}>{err}</div>}
      </Panel>

      <TableWrap>
        <thead><tr><th>Сотрудник</th><th>Роль</th><th>Филиал</th><th>Доступ</th><th>Вход</th><th></th></tr></thead>
        <tbody>
          {invites === null && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30 }}><Spinner dark /></td></tr>}
          {invites?.length === 0 && <tr><td colSpan={6} style={{ color: '#6B6258' }}>Сотрудников пока нет.</td></tr>}
          {groups.map(([phone, list]) => {
            const name = list.find((x) => x.display_name)?.display_name ?? registered[phone] ?? 'Сотрудник';
            return (
              <tr key={phone}>
                <td><b>{name}</b><div style={{ fontSize: 12, color: '#6B6258' }}>{formatPhone(phone)}</div></td>
                <td><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{list.map((i) => <Badge key={i.id} color={ROLE_COLOR[i.role]}>{ROLE_LABEL[i.role]}</Badge>)}</div></td>
                <td>{list.map((i) => <div key={i.id}>{brName(i.branch_id)}</div>)}</td>
                <td>{list.map((i) => <div key={i.id}>{ROLE_PERM[i.role]}</div>)}</td>
                <td style={{ fontWeight: 700, color: phone in registered ? '#2E8B3F' : '#6B6258' }}>{phone in registered ? 'уже входил' : 'ещё не входил'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn" onClick={() => setNameEdit({ phone, name: list.find((x) => x.display_name)?.display_name ?? '' })} style={smallBtn}>Имя</button>
                    <button className="btn" onClick={() => setPhoneEdit({ phone, name })} style={smallBtn}>Изменить номер</button>
                    {list.map((i) => (
                      <button key={i.id} className="btn" onClick={() => revoke(i)} style={{ ...smallBtn, color: '#B3261E' }}>Отозвать{list.length > 1 ? ` · ${ROLE_LABEL[i.role]}` : ''}</button>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 8 }}>Сотрудники регистрируются только здесь, через администратора. Самостоятельно получить роль нельзя.</div>
      {phoneEdit && <PhoneModal who={phoneEdit} onClose={() => setPhoneEdit(null)} onDone={() => { setPhoneEdit(null); load(); }} />}
      {nameEdit && <NameModal who={nameEdit} onClose={() => setNameEdit(null)} onDone={() => { setNameEdit(null); load(); }} />}

      <div style={{ marginTop: 24, fontWeight: 800, fontSize: 15 }}>Курьеры</div>
      <TableWrap>
        <thead><tr><th>Курьер</th><th>Телефон</th><th>На линии</th><th>Активные заказы</th><th>Активен</th></tr></thead>
        <tbody>
          {!live.ready && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30 }}><Spinner dark /></td></tr>}
          {live.ready && !couriers.length && <tr><td colSpan={5} style={{ color: '#6B6258' }}>Курьеров пока нет — выдайте роль «Курьер» выше.</td></tr>}
          {couriers.map((c) => (
            <tr key={c.user_id}>
              <td><b>{c.display_name}</b></td>
              <td>{c.phone ? formatPhone(c.phone) : '—'}</td>
              <td><OnlineBadge online={c.is_online} /></td>
              <td>{c.active.length ? <><b>{c.active.length}</b> · {c.active.map((o) => `#TB-${o.order_no}`).join(', ')}</> : <span style={{ color: '#6B6258' }}>нет</span>}</td>
              <td><Toggle on={c.is_active} onChange={(v) => setCourierActive(c, v)} label={`Активность курьера ${c.display_name}`} /></td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 8 }}>Курьера с активными заказами нельзя отключить или снять с роли — сначала переназначьте его заказы в разделе «Заказы».</div>
    </>
  );
}

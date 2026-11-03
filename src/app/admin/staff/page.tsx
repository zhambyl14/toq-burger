'use client';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Badge, Label, PageHead, Panel, PhoneInput, TableWrap, Toggle, useAdminBranches } from '@/components/admin/kit';
import { Spinner, toast } from '@/components/ui';
import { errText } from '@/features/admin/transitions';
import { formatPhone } from '@/lib/phone';
import { sb } from '@/lib/supabase/client';

type StaffRole = 'ADMIN' | 'KITCHEN' | 'OPERATOR' | 'COURIER';
interface Invite { id: string; phone: string; role: StaffRole; branch_id: string | null; display_name: string | null; created_at: string }
interface CourierRow { user_id: string; display_name: string; is_active: boolean; is_online: boolean }

const ROLE_LABEL: Record<StaffRole, string> = { ADMIN: 'Администратор', KITCHEN: 'Кухня', OPERATOR: 'Оператор', COURIER: 'Курьер' };
const ROLE_PERM: Record<StaffRole, string> = { ADMIN: 'Полный доступ', KITCHEN: 'Заказы своего филиала', OPERATOR: 'Заказы своего филиала', COURIER: 'Доставки' };
const ROLE_COLOR: Record<StaffRole, string> = { ADMIN: '#141210', KITCHEN: '#C24D00', OPERATOR: '#0B6EE5', COURIER: '#7B3FE4' };

const inviteSchema = z.object({
  phone: z.string().regex(/^7\d{9}$/, 'Введите 10 цифр номера после +7'),
  role: z.enum(['ADMIN', 'KITCHEN', 'OPERATOR', 'COURIER']),
  branch: z.string(),
  name: z.string().trim().max(60),
}).refine((d) => !['KITCHEN', 'OPERATOR'].includes(d.role) || d.branch !== '', { message: 'Для кухни и оператора выберите филиал' });

export default function AdminStaff() {
  const branches = useAdminBranches();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [registered, setRegistered] = useState<Record<string, string | null>>({});
  const [couriers, setCouriers] = useState<CourierRow[]>([]);
  const [courierPhones, setCourierPhones] = useState<Record<string, string>>({});
  const [f, setF] = useState({ phone: '', role: 'KITCHEN' as StaffRole, branch: '', name: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const [i, c] = await Promise.all([
      sb().from('staff_invites').select('id,phone,role,branch_id,display_name,created_at').order('created_at', { ascending: false }),
      sb().from('couriers').select('user_id,display_name,is_active,is_online').order('created_at'),
    ]);
    const inv = (i.data as Invite[]) ?? [];
    setInvites(inv);
    const cl = (c.data as CourierRow[]) ?? [];
    setCouriers(cl);
    const phones = Array.from(new Set(inv.map((x) => x.phone)));
    const [pr, cp] = await Promise.all([
      phones.length ? sb().from('profiles').select('id,phone,full_name').in('phone', phones) : Promise.resolve({ data: [] }),
      cl.length ? sb().from('profiles').select('id,phone').in('id', cl.map((x) => x.user_id)) : Promise.resolve({ data: [] }),
    ]);
    const reg: Record<string, string | null> = {};
    ((pr.data ?? []) as { phone: string; full_name: string | null }[]).forEach((p) => { reg[p.phone] = p.full_name; });
    setRegistered(reg);
    const cph: Record<string, string> = {};
    ((cp.data ?? []) as { id: string; phone: string }[]).forEach((p) => { cph[p.id] = p.phone; });
    setCourierPhones(cph);
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
    if (error) return toast(errText(error.message));
    toast('Доступ отозван');
    load();
  };

  const setCourierActive = async (c: CourierRow, v: boolean) => {
    const { error } = await sb().rpc('admin_set_courier_active', { p_user: c.user_id, p_active: v });
    if (error) return toast(errText(error.message));
    toast(v ? 'Курьер активен' : 'Курьер отключён — не получит новые заказы');
    load();
  };

  const brName = (id: string | null) => (id ? branches.find((b) => b.id === id)?.short_name ?? '—' : 'Все');
  const needsBranch = f.role === 'KITCHEN' || f.role === 'OPERATOR';

  return (
    <>
      <PageHead title="Сотрудники и роли" />
      <Panel style={{ marginTop: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Выдать доступ сотруднику</div>
        <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 4 }}>Сотрудник входит на сайт по своему номеру (код в WhatsApp). Роль применяется автоматически — сразу или при первом входе.</div>
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
        <thead><tr><th>Пользователь</th><th>Роль</th><th>Филиал</th><th>Доступ</th><th>Вход</th><th></th></tr></thead>
        <tbody>
          {invites === null && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30 }}><Spinner dark /></td></tr>}
          {invites?.length === 0 && <tr><td colSpan={6} style={{ color: '#6B6258' }}>Сотрудников пока нет.</td></tr>}
          {invites?.map((i) => (
            <tr key={i.id}>
              <td><b>{i.display_name ?? registered[i.phone] ?? 'Сотрудник'}</b><div style={{ fontSize: 12, color: '#6B6258' }}>{formatPhone(i.phone)}</div></td>
              <td><Badge color={ROLE_COLOR[i.role]}>{ROLE_LABEL[i.role]}</Badge></td>
              <td>{brName(i.branch_id)}</td>
              <td>{ROLE_PERM[i.role]}</td>
              <td style={{ fontWeight: 700, color: i.phone in registered ? '#2E8B3F' : '#6B6258' }}>{i.phone in registered ? 'уже входил' : 'ещё не входил'}</td>
              <td><button className="btn" onClick={() => revoke(i)} style={{ minHeight: 40, padding: '0 12px', borderRadius: 12, background: '#F3EADF', color: '#B3261E', fontWeight: 800, fontSize: 13 }}>Отозвать</button></td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <div style={{ marginTop: 24, fontWeight: 800, fontSize: 15 }}>Курьеры</div>
      <TableWrap>
        <thead><tr><th>Курьер</th><th>Телефон</th><th>На линии</th><th>Активен</th></tr></thead>
        <tbody>
          {!couriers.length && <tr><td colSpan={4} style={{ color: '#6B6258' }}>Курьеров пока нет — выдайте роль «Курьер» выше.</td></tr>}
          {couriers.map((c) => (
            <tr key={c.user_id}>
              <td><b>{c.display_name}</b></td>
              <td>{courierPhones[c.user_id] ? formatPhone(courierPhones[c.user_id]) : '—'}</td>
              <td style={{ fontWeight: 800, color: c.is_online ? '#2E8B3F' : '#6B6258' }}>{c.is_online ? 'да' : 'нет'}</td>
              <td><Toggle on={c.is_active} onChange={(v) => setCourierActive(c, v)} label={`Активность курьера ${c.display_name}`} /></td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}

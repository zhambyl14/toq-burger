'use client';
import { useEffect, useState } from 'react';
import { sb } from '@/lib/supabase/client';

export interface BranchLite { id: string; short_name: string; name: string }

let branchCache: BranchLite[] | null = null;

/** All branches (including inactive) for filters/selects. */
export function useAdminBranches(): BranchLite[] {
  const [list, setList] = useState<BranchLite[]>(branchCache ?? []);
  useEffect(() => {
    if (branchCache) return;
    sb().from('branches').select('id,short_name,name').order('sort_order').then(({ data }) => {
      branchCache = (data as BranchLite[]) ?? [];
      setList(branchCache);
    });
  }, []);
  return list;
}

export function invalidateBranches() {
  branchCache = null;
}

export function PageHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <h1 className="disp" style={{ fontSize: 26, fontWeight: 800, flex: 1, minWidth: 200 }}>{title}</h1>
      {children}
    </div>
  );
}

export function BranchFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const branches = useAdminBranches();
  const opts = [{ id: 'all', short_name: 'Все филиалы' }, ...branches];
  return (
    <div className="admin-scroll-x" style={{ display: 'flex', gap: 6, background: '#fff', borderRadius: 22, padding: 4, maxWidth: '100%', overflowX: 'auto' }}>
      {opts.map((b) => (
        <button key={b.id} className="btn" onClick={() => onChange(b.id)} aria-pressed={value === b.id}
          style={{ flex: 'none', minHeight: 40, padding: '0 14px', borderRadius: 18, fontWeight: 800, fontSize: 13, background: value === b.id ? '#141210' : 'transparent', color: value === b.id ? '#fff' : '#141210' }}>{b.short_name}</button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button className="btn" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      style={{ width: 48, height: 28, borderRadius: 14, background: on ? '#2E8B3F' : '#CFC4B5', position: 'relative', flex: 'none', opacity: disabled ? 0.5 : 1 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
    </button>
  );
}

export function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: '#fff', borderRadius: 22, padding: 20, ...style }}>{children}</div>;
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 22, marginTop: 16, overflowX: 'auto' }}>
      <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>{children}</table>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, justifyContent: 'flex-end', fontWeight: 700, fontSize: 13 }}>
      <span style={{ color: '#6B6258' }}>Всего: {total}</span>
      <button className="btn" disabled={page <= 0} onClick={() => onPage(page - 1)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 12, background: '#fff', opacity: page <= 0 ? 0.4 : 1, fontWeight: 800 }}>←</button>
      <span>{page + 1} / {pages}</span>
      <button className="btn" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 12, background: '#fff', opacity: page >= pages - 1 ? 0.4 : 1, fontWeight: 800 }}>→</button>
    </div>
  );
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(20,18,16,.45)', animation: 'fade .2s' }} />
      <div style={{ position: 'relative', width: 'min(560px, 100%)', height: '100%', background: '#F3EADF', overflowY: 'auto', padding: 24, boxSizing: 'border-box', animation: 'up .25s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="disp" style={{ fontSize: 20, fontWeight: 800, flex: 1 }}>{title}</div>
          <button className="btn" onClick={onClose} aria-label="Закрыть" style={{ width: 44, height: 44, borderRadius: '50%', background: '#fff', fontSize: 18, fontWeight: 800 }}>✕</button>
        </div>
        <div style={{ marginTop: 16 }}>{children}</div>
      </div>
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 800, color: '#6B6258', marginTop: 12, marginBottom: 6 }}>{children}</div>;
}

export function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ padding: '4px 10px', borderRadius: 10, background: color, color: '#fff', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>{children}</span>;
}

/** Fixed "+7" prefix, 10 editable digits. */
export function PhoneInput({ value, onChange, id }: { value: string; onChange: (ten: string) => void; id?: string }) {
  const shown = value.replace(/(\d{3})(\d{0,3})(\d{0,2})(\d{0,2})/, (_, a, b, c, d) => [a, b, c, d].filter(Boolean).join(' '));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 48, borderRadius: 14, border: '2px solid #F3EADF', padding: '0 12px', background: '#fff' }}>
      <span aria-hidden="true" style={{ fontWeight: 800, userSelect: 'none' }}>+7</span>
      <input id={id} value={shown} inputMode="numeric" placeholder="747 400 53 47" aria-label="Телефон после +7"
        onChange={(e) => {
          let d = e.target.value.replace(/\D/g, '');
          if (d.length === 11 && (d[0] === '7' || d[0] === '8')) d = d.slice(1);
          onChange(d.slice(0, 10));
        }}
        style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', fontWeight: 800, fontSize: 15, background: 'none' }} />
    </div>
  );
}

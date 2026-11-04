'use client';
import { ProductImg } from '@/components/ui';
import '@/styles/admin-products.css';

/** Wraps a Kazakh input/textarea with the small «ҚАЗ» badge. */
export function KkWrap({ children, area }: { children: React.ReactNode; area?: boolean }) {
  return (
    <div className={area ? 'apr-kkwrap apr-kkwrap--ta' : 'apr-kkwrap'}>
      {children}
      <span className="apr-badge" aria-hidden="true">ҚАЗ</span>
    </div>
  );
}

export function PhotoRow({ label, path, disabled, onFile, onDelete }: { label: string; path: string | null; disabled: boolean; onFile: (f: File | undefined) => void; onDelete: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
      <div style={{ width: 64, height: 64, borderRadius: 14, background: '#FFF1E0', overflow: 'hidden', flex: 'none' }}><ProductImg path={path} /></div>
      <div style={{ flex: 1, fontWeight: 700, fontSize: 13, minWidth: 0 }}>{label}<div style={{ fontSize: 11, color: '#6B6258', wordBreak: 'break-all' }}>{path ?? 'не загружено'}</div></div>
      <label className="btn" style={{ minHeight: 40, padding: '0 14px', borderRadius: 12, background: '#141210', color: '#fff', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
        Загрузить
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} aria-label={`Загрузить: ${label}`} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} style={{ display: 'none' }} />
      </label>
      {path && <button type="button" className="btn" disabled={disabled} onClick={onDelete} aria-label={`Удалить фото: ${label}`} style={{ minHeight: 40, padding: '0 12px', borderRadius: 12, background: '#F3EADF', color: '#B3261E', fontWeight: 800, fontSize: 13 }}>Удалить фото</button>}
    </div>
  );
}

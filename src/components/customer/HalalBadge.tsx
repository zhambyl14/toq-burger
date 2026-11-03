export function HalalBadge({ dark }: { dark?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', borderRadius: 14, background: dark ? '#141210' : '#fff', color: dark ? '#fff' : '#141210', fontSize: 12, fontWeight: 800, letterSpacing: '.04em', whiteSpace: 'nowrap' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2E8B3F" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
      100% ХАЛАЛ
    </span>
  );
}

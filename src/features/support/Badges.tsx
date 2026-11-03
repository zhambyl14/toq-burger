import { KIND_COLOR, KIND_LABEL, STATUS_COLOR, STATUS_LABEL, type SupportKind, type SupportStatus } from './types';

const chip = { padding: '3px 9px', borderRadius: 10, color: '#fff', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' as const };

export function StatusBadge({ status }: { status: SupportStatus }) {
  return <span style={{ ...chip, background: STATUS_COLOR[status] ?? '#6B6258' }}>{STATUS_LABEL[status] ?? status}</span>;
}

export function KindBadge({ kind }: { kind: SupportKind }) {
  return <span style={{ ...chip, background: KIND_COLOR[kind] ?? '#6B6258' }}>{KIND_LABEL[kind] ?? kind}</span>;
}

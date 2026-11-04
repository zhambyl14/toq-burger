'use client';
import { useLang } from '@/i18n/LangProvider';
import { KIND_COLOR, STATUS_COLOR, supportKindLabel, supportStatusLabel, type SupportKind, type SupportStatus } from './types';

const chip = { padding: '3px 9px', borderRadius: 10, color: '#fff', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' as const };

export function StatusBadge({ status }: { status: SupportStatus }) {
  const { lang } = useLang();
  return <span style={{ ...chip, background: STATUS_COLOR[status] ?? '#6B6258' }}>{supportStatusLabel(status, lang)}</span>;
}

export function KindBadge({ kind }: { kind: SupportKind }) {
  const { lang } = useLang();
  return <span style={{ ...chip, background: KIND_COLOR[kind] ?? '#6B6258' }}>{supportKindLabel(kind, lang)}</span>;
}

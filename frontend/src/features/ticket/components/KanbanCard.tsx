import TypeBadge from '@/components/ui/TypeBadge';
import type { TicketSummary } from '@/types/ticket';
import type { User } from '@/types/auth';

interface Props {
  ticket: TicketSummary;
  user: User | null;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  pickingUpId?: number | null;
  cancellingId?: number | null;
  onPickup?: () => void;
  onCancelPickup?: () => void;
}

const elapsedDays = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

// 담당자 이름에서 일관된 색상 생성
const AVATAR_PALETTES = [
  { bg: '#dbeafe', fg: '#1e40af' },
  { bg: '#dcfce7', fg: '#15803d' },
  { bg: '#fce7f3', fg: '#9d174d' },
  { bg: '#ede9fe', fg: '#6d28d9' },
  { bg: '#ffedd5', fg: '#c2410c' },
  { bg: '#cffafe', fg: '#0e7490' },
  { bg: '#fef9c3', fg: '#854d0e' },
  { bg: '#f1f5f9', fg: '#475569' },
];
const getAvatarPalette = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
};

const KanbanCard = ({
  ticket, user, onClick, onDragStart, onDragEnd, isDragging,
  pickingUpId, cancellingId, onPickup, onCancelPickup,
}: Props) => {
  const canPickup = user?.role === 'DEVELOPER' || user?.role === 'ADMIN';
  const isMine = user !== null && ticket.assigneeId === user.id;
  const days = elapsedDays(ticket.createdAt);
  const isLate = days >= 3;
  const assigneeName = ticket.assigneeName ?? '';
  const initial = (assigneeName || '?')[0].toUpperCase();
  const palette = assigneeName ? getAvatarPalette(assigneeName) : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="group select-none cursor-grab active:cursor-grabbing"
      style={{
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 10,
        padding: '10px 12px',
        transition: 'transform 0.12s, box-shadow 0.12s, opacity 0.12s, border-color 0.12s',
        // 드래그 중: 반투명 + 미세 회전
        opacity: isDragging ? 0.35 : 1,
        transform: isDragging ? 'scale(0.97) rotate(1deg)' : undefined,
        boxShadow: isDragging
          ? '0 8px 24px rgba(0,0,0,0.15)'
          : '0 1px 3px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={(e) => {
        if (isDragging) return;
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px rgba(0,0,0,0.1)';
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,0,0,0.14)';
      }}
      onMouseLeave={(e) => {
        if (isDragging) return;
        (e.currentTarget as HTMLElement).style.transform = '';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,0,0,0.08)';
      }}
    >
      {/* ── 상단: 티켓번호 · 긴급 · 타입 ── */}
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="font-mono text-[10px] tracking-wide"
          style={{ color: 'var(--dt-text-muted)', opacity: 0.8 }}
        >
          {ticket.ticketNo}
        </span>
        <div className="flex items-center gap-1">
          {ticket.isUrgent && (
            <span
              className="inline-flex items-center gap-0.5 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: '#fff1f2', color: '#e11d48' }}
            >
              ⚡ 긴급
            </span>
          )}
          <TypeBadge type={ticket.ticketType} />
        </div>
      </div>

      {/* ── 제목 ── */}
      <p
        className="text-[12.5px] font-semibold leading-snug mb-2"
        style={{
          color: 'var(--dt-text-primary)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {ticket.title}
      </p>

      {/* ── 제품명 배지 (있을 때만) ── */}
      {ticket.productName && (
        <div className="mb-2">
          <span
            className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(0,0,0,0.04)',
              color: 'var(--dt-text-muted)',
              border: '1px solid rgba(0,0,0,0.07)',
            }}
          >
            {ticket.productName}
          </span>
        </div>
      )}

      {/* ── 하단: 담당자 · 경과일 ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {assigneeName ? (
            <span
              className="inline-flex items-center justify-center flex-shrink-0 rounded-full text-[9px] font-bold"
              style={{
                width: 18, height: 18,
                backgroundColor: palette!.bg,
                color: palette!.fg,
              }}
            >
              {initial}
            </span>
          ) : (
            <span
              className="inline-flex items-center justify-center flex-shrink-0 rounded-full text-[9px]"
              style={{
                width: 18, height: 18,
                backgroundColor: '#f1f5f9',
                color: '#94a3b8',
              }}
            >
              ?
            </span>
          )}
          <span
            className="text-[11px] truncate"
            style={{ color: 'var(--dt-text-muted)' }}
          >
            {assigneeName || <span style={{ color: '#cbd5e1' }}>미배정</span>}
          </span>
        </div>

        <span
          className="text-[10.5px] font-medium flex-shrink-0 tabular-nums"
          style={{
            color: isLate ? '#e11d48' : 'var(--dt-text-muted)',
            opacity: isLate ? 1 : 0.7,
          }}
        >
          {days}일
        </span>
      </div>

      {/* ── 픽업 버튼 ── */}
      {canPickup && ticket.status === 1 && onPickup && (
        <button
          className="mt-2 w-full text-[11px] py-1.5 rounded-lg font-semibold transition-colors duration-150 disabled:opacity-50"
          style={{
            background: 'var(--dt-primary-light)',
            color: 'var(--dt-primary)',
          }}
          disabled={pickingUpId === ticket.id}
          onClick={(e) => { e.stopPropagation(); onPickup(); }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--dt-primary)';
            (e.currentTarget as HTMLElement).style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--dt-primary-light)';
            (e.currentTarget as HTMLElement).style.color = 'var(--dt-primary)';
          }}
        >
          {pickingUpId === ticket.id ? '처리 중...' : '픽업하기'}
        </button>
      )}

      {/* ── 픽업 취소 버튼 (status 4 진행중 → 검토완료 되돌리기) ── */}
      {canPickup && ticket.status === 4 && (isMine || user?.role === 'ADMIN') && onCancelPickup && (
        <button
          className="mt-2 w-full text-[11px] py-1.5 rounded-lg font-semibold transition-colors duration-150 disabled:opacity-50"
          style={{ background: '#fff1f2', color: '#e11d48' }}
          disabled={cancellingId === ticket.id}
          onClick={(e) => { e.stopPropagation(); onCancelPickup(); }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = '#ffe4e6';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = '#fff1f2';
          }}
        >
          {cancellingId === ticket.id ? '처리 중...' : '픽업 취소'}
        </button>
      )}
    </div>
  );
};

export default KanbanCard;

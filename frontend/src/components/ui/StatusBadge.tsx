import type { ReactNode } from 'react';
import { TICKET_STATUS_LABEL, type TicketStatus } from '@/types/ticket';
import Badge, { type BadgeTone, type BadgeVariant } from './Badge';

interface Props {
  status: TicketStatus;
  className?: string;
  variant?: BadgeVariant;
}

const toneByStatus: Record<TicketStatus, BadgeTone> = {
  1: 'waiting',   // 검토대기
  2: 'ready',     // 검토완료
  3: 'ready',     // 픽업대기
  4: 'progress',  // 진행중
  5: 'qa',        // QA검증
  6: 'done',      // 완료
  7: 'neutral',   // 보류
  8: 'urgent',    // 반려
};

// 정적 dot
const dot = <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 flex-shrink-0" />;
// 펄스 dot
const pulse = <span className="dt-dot-pulse h-1.5 w-1.5 rounded-full bg-current flex-shrink-0" />;
// 체크마크
const check = (
  <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.5 8.2 6.4 11l6.1-6.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
// 일시정지
const pause = (
  <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="4" y="4" width="2.5" height="8" rx="1" fill="currentColor" opacity="0.7" />
    <rect x="9.5" y="4" width="2.5" height="8" rx="1" fill="currentColor" opacity="0.7" />
  </svg>
);
// X
const cross = (
  <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
// 화살표 (진행가능)
const arrow = (
  <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
// 돋보기 (검토완료)
const magnify = (
  <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.7" />
    <path d="M10.5 10.5l2.5 2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const iconByStatus: Record<TicketStatus, ReactNode> = {
  1: dot,     // 검토대기
  2: check,   // 검토완료
  3: arrow,   // 픽업대기
  4: pulse,   // 진행중
  5: pulse,   // QA검증
  6: check,   // 완료
  7: pause,   // 보류
  8: cross,   // 반려
};

const StatusBadge = ({ status, className = '', variant = 'soft' }: Props) => {
  return (
    <Badge
      tone={toneByStatus[status]}
      variant={variant}
      size="xs"
      className={className}
    >
      {TICKET_STATUS_LABEL[status]}
    </Badge>
  );
};

export default StatusBadge;

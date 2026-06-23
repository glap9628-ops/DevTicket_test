import type { TicketStatus } from '@/types/ticket';

export const STATUS_BADGE_CLASS: Record<TicketStatus, string> = {
  1: 'dt-soft-pill dt-soft-pill-waiting',   // 검토대기
  2: 'dt-soft-pill dt-soft-pill-ready',     // 검토완료
  3: 'dt-soft-pill dt-soft-pill-ready',     // 픽업대기
  4: 'dt-soft-pill dt-soft-pill-progress',  // 진행중
  5: 'dt-soft-pill dt-soft-pill-qa',        // QA검증
  6: 'dt-soft-pill dt-soft-pill-done',      // 완료
  7: 'dt-soft-pill dt-soft-pill-neutral',   // 보류
  8: 'dt-soft-pill dt-soft-pill-urgent',    // 반려
};

export const DASHBOARD_STATUS_HEX = {
  waiting:   '#78716c',
  progress:  '#5b21b6',
  review:    '#0d9488',
  done:      '#15803d',
  hold:      '#52525b',
  rejected:  '#b91c1c',
  neutral:   '#52525b',
  typeQa:    '#c2410c',
  typeDevops:'#78716c',
  typeDev:   '#2563eb',
  typeVendor:'#15803d',
} as const;

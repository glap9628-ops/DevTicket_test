export type TicketType = 1 | 2 | 3 | 4 | 5;
export type TicketStatus = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** CI/CD 연동 플랫폼 구분값 */
export const PLATFORM_OPTIONS = ['MANAGER', 'AGENT'] as const;
export type Platform = (typeof PLATFORM_OPTIONS)[number];

export const PRODUCT_OPTIONS = [
  'innoECM',
  'SecureZone',
  'nPouch',
  'innoMark',
  'RansomCruncher',
  'LizardBackup',
  'innoLog',
  '기타',
] as const;

export type ProductName = (typeof PRODUCT_OPTIONS)[number];

// ── 티켓 유형 ──────────────────────────────────────────────────────
export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  1: 'QA 오류',
  2: '장애/오류',
  3: '신규개발/개선',
  4: '고객요청',
  5: '유지보수',   // 레거시 — 신규 등록 불가
};

export const TICKET_TYPE_PREFIX: Record<TicketType, string> = {
  1: 'QA',
  2: 'BUG',
  3: 'DEV',
  4: 'OPS',
  5: 'MNT',   // 레거시
};

// ── 상태 ──────────────────────────────────────────────────────────
/**
 * 상태 흐름:
 *   검토대기(1) → 검토완료(2) → 픽업대기(3) → 진행중(4) → QA검증(5) → 완료(6)
 *             ↘ 반려(8)     ↘ 반려(8)      ↘ 보류(7)
 */
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  1: '검토대기',
  2: '검토완료',
  3: '픽업대기',
  4: '진행중',
  5: 'QA검증',
  6: '완료',
  7: '보류',
  8: '반려',
};

export const TICKET_STATUS_COLOR: Record<TicketStatus, string> = {
  1: 'dt-soft-pill dt-soft-pill-waiting',
  2: 'dt-soft-pill dt-soft-pill-ready',
  3: 'dt-soft-pill dt-soft-pill-ready',
  4: 'dt-soft-pill dt-soft-pill-progress',
  5: 'dt-soft-pill dt-soft-pill-qa',
  6: 'dt-soft-pill dt-soft-pill-done',
  7: 'dt-soft-pill dt-soft-pill-waiting',
  8: 'dt-soft-pill dt-soft-pill-urgent',
};

// ── 난이도 ────────────────────────────────────────────────────────
export const DIFFICULTY_LABEL: Record<number, string> = {
  1: '하',
  2: '중',
  3: '상',
};

export const DIFFICULTY_COLOR: Record<number, string> = {
  1: 'text-green-600 bg-green-50',
  2: 'text-amber-600 bg-amber-50',
  3: 'text-red-600 bg-red-50',
};

// ── 우선순위 ──────────────────────────────────────────────────────
export const PRIORITY_LABEL: Record<number, string> = {
  1: '낮음',
  2: '보통',
  3: '높음',
  4: '긴급',
};

export const PRIORITY_COLOR: Record<number, string> = {
  1: 'text-gray-500 bg-gray-50',
  2: 'text-blue-600 bg-blue-50',
  3: 'text-orange-600 bg-orange-50',
  4: 'text-red-600 bg-red-50',
};

// ── DTO 타입 ──────────────────────────────────────────────────────
export interface TicketSummary {
  id: number;
  ticketNo: string;
  ticketType: TicketType;
  title: string;
  status: TicketStatus;
  isUrgent: boolean;
  productName?: string;
  platform?: string;
  errorBug?: string;
  buildVersion?: string;
  qaFilePath?: string;
  attachmentPath?: string;
  requesterName: string;
  assigneeId?: number;
  assigneeName?: string;
  createdAt: string;
  updatedAt: string;
  // Phase 1 신규
  requestedDueDate?: string;
  desiredDueDate?: string;
  requestingDept?: string;
  difficulty?: number;
  priority?: number;
  expectedEffort?: number;
  effortUnit?: string;
}

export interface TicketHistory {
  id: number;
  fromStatus?: TicketStatus;
  toStatus: TicketStatus;
  reason?: string;
  changedByName: string;
  changedAt: string;
}

export interface Ticket extends TicketSummary {
  requesterId: number;
  extraFields?: Record<string, unknown>;
  historyList: TicketHistory[];
  completedAt?: string;
  // Phase 1 신규
  expectedEffort?: number;
  effortUnit?: string;
  reviewedById?: number;
  reviewedByName?: string;
  reviewedAt?: string;
}

export interface TicketListRes {
  content: TicketSummary[];
  totalCount: number;
  page: number;
  size: number;
}

export interface DeveloperStat {
  assigneeId: number;
  assigneeName: string;
  inProgressCount: number;
  doneCount: number;
}

export interface RecentActivity {
  ticketId: number;
  ticketNo: string;
  title: string;
  fromStatus?: number;
  toStatus: number;
  changedByName: string;
  changedAt: string;
}

export interface Dashboard {
  statusCounts: Record<string, number>;
  typeCounts: Record<string, number>;
  productCounts?: Record<string, number>;
  delayedTickets: TicketSummary[];
  developerStats: DeveloperStat[];
  urgentCount: number;
  recentActivities: RecentActivity[];
}

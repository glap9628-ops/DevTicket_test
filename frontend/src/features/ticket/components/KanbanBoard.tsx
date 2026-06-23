import { useEffect, useState } from 'react';
import KanbanCard from './KanbanCard';
import type { TicketSummary, TicketStatus } from '@/types/ticket';
import type { User } from '@/types/auth';
import MentionInput from '@/components/mention/MentionInput';

// ─── 컬럼 정의 ────────────────────────────────────────────────────────────────
interface ColumnDef {
  status: TicketStatus;
  label: string;
  dotColor: string;
  headerBg: string;
  textColor: string;
  dropRingColor: string;
  dropBg: string;
}

const COLUMNS: ColumnDef[] = [
  {
    status: 1, label: '검토대기',
    dotColor:      '#d97706',
    headerBg:      'rgba(150,98,26,0.06)',
    textColor:     '#7a4e0f',
    dropRingColor: '#96621a',
    dropBg:        'rgba(150,98,26,0.04)',
  },
  {
    status: 3, label: '검토완료',
    dotColor:      '#2563eb',
    headerBg:      'rgba(37,99,235,0.07)',
    textColor:     '#1e40af',
    dropRingColor: '#2563eb',
    dropBg:        'rgba(37,99,235,0.04)',
  },
  {
    status: 4, label: '진행중',
    dotColor:      '#3b82f6',
    headerBg:      'rgba(47,95,163,0.07)',
    textColor:     '#1d4273',
    dropRingColor: '#2f5fa3',
    dropBg:        'rgba(47,95,163,0.04)',
  },
  {
    status: 5, label: 'QA',
    dotColor:      '#8b5cf6',
    headerBg:      'rgba(96,64,168,0.07)',
    textColor:     '#3e2a7e',
    dropRingColor: '#6040a8',
    dropBg:        'rgba(96,64,168,0.04)',
  },
  {
    status: 6, label: '완료',
    dotColor:      '#10b981',
    headerBg:      'rgba(39,111,74,0.07)',
    textColor:     '#155230',
    dropRingColor: '#276f4a',
    dropBg:        'rgba(39,111,74,0.04)',
  },
  {
    status: 7, label: '보류',
    dotColor:      '#64748b',
    headerBg:      'rgba(71,85,105,0.07)',
    textColor:     '#2d3748',
    dropRingColor: '#475569',
    dropBg:        'rgba(71,85,105,0.04)',
  },
  {
    status: 8, label: '반려',
    dotColor:      '#ef4444',
    headerBg:      'rgba(181,43,43,0.07)',
    textColor:     '#7f1d1d',
    dropRingColor: '#b52b2b',
    dropBg:        'rgba(181,43,43,0.04)',
  },
];

// ─── 유효 전환 / 사유 필요 여부 ────────────────────────────────────────────────
// 픽업: 3→4 (onPickup 핸들러), 픽업취소: 4→3 (onCancelPickup 핸들러)
// 아래 VALID_TRANSITIONS 은 픽업/픽업취소 외 일반 상태변경에 사용됨
const VALID_TRANSITIONS: Partial<Record<TicketStatus, TicketStatus[]>> = {
  4: [5, 6, 7],   // 진행중 → QA / 완료 / 보류
  5: [4, 6],      // QA → 재검증(진행중) / 완료
  7: [3],         // 보류 → 진행가능복귀 (admin)
};
const needsReason = (from: TicketStatus, to: TicketStatus) =>
  to === 7 || to === 8 || (from === 5 && to === 4);

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  tickets: TicketSummary[];
  user: User | null;
  onStatusChange: (ticketId: number, newStatus: TicketStatus, reason?: string) => Promise<void>;
  onCardClick: (id: number) => void;
  onPickup: (ticketId: number) => void;
  onCancelPickup: (ticketId: number) => void;
  pickingUpId?: number | null;
  cancellingId?: number | null;
  loading?: boolean;
}

const KanbanBoard = ({
  tickets, user, onStatusChange, onCardClick,
  onPickup, onCancelPickup, pickingUpId, cancellingId, loading,
}: Props) => {
  const [dragging, setDragging]       = useState<TicketSummary | null>(null);
  const [dropTarget, setDropTarget]   = useState<TicketStatus | null>(null);

  const [reasonModal, setReasonModal] = useState<{
    ticketId: number; fromStatus: TicketStatus; targetStatus: TicketStatus;
  } | null>(null);
  const [reason, setReason]           = useState('');
  const [reasonError, setReasonError] = useState('');
  const [submitting, setSubmitting]   = useState(false);

  // Escape 키로 모달 닫기
  useEffect(() => {
    if (!reasonModal) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) setReasonModal(null); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [reasonModal, submitting]);

  const grouped = COLUMNS.reduce<Record<number, TicketSummary[]>>((acc, col) => {
    acc[col.status] = tickets.filter((t) => t.status === col.status);
    return acc;
  }, {});

  // ─── 드롭 처리 ──────────────────────────────────────────────────────────────
  const handleDrop = async (targetStatus: TicketStatus) => {
    setDropTarget(null);
    if (!dragging || dragging.status === targetStatus) { setDragging(null); return; }
    const fromStatus = dragging.status;

    // 진행가능(3) → 진행중(4) = 픽업
    if (fromStatus === 3 && targetStatus === 4) {
      onPickup(dragging.id); setDragging(null); return;
    }
    // 진행중(4) → 진행가능(3) = 픽업취소
    if (fromStatus === 4 && targetStatus === 3) {
      onCancelPickup(dragging.id); setDragging(null); return;
    }

    const allowed = (VALID_TRANSITIONS[fromStatus as keyof typeof VALID_TRANSITIONS] ?? []) as TicketStatus[];
    if (!allowed.includes(targetStatus)) { setDragging(null); return; }

    if (needsReason(fromStatus, targetStatus)) {
      setReasonModal({ ticketId: dragging.id, fromStatus, targetStatus });
      setReason('');
      setReasonError('');
    } else {
      await onStatusChange(dragging.id, targetStatus);
    }
    setDragging(null);
  };

  const handleReasonSubmit = async () => {
    if (!reason.trim()) { setReasonError('사유를 입력해주세요.'); return; }
    if (!reasonModal) return;
    setSubmitting(true);
    try {
      await onStatusChange(reasonModal.ticketId, reasonModal.targetStatus, reason.trim());
      setReasonModal(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; detail?: string } } };
      setReasonError(e?.response?.data?.message || e?.response?.data?.detail || '처리 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── 로딩 ────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-gray-400"
        style={{ height: 'calc(100vh - 275px)', minHeight: 360 }}>
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        불러오는 중...
      </div>
    );
  }

  // ─── 드롭 가능 여부 판별 ─────────────────────────────────────────────────────
  const isDroppable = (colStatus: TicketStatus): boolean => {
    if (!dragging) return false;
    const from = dragging.status;
    if (from === colStatus) return false;
    if (from === 3 && colStatus === 4) return true;  // 픽업
    if (from === 4 && colStatus === 3) return true;  // 픽업취소
    const allowed = (VALID_TRANSITIONS[from as keyof typeof VALID_TRANSITIONS] ?? []) as TicketStatus[];
    return allowed.includes(colStatus);
  };

  return (
    <>
      {/*
        ────────────────────────────────────────────────────────────────────────
        Board container
        - min-w-0: flex child가 부모를 밀지 않게 → 페이지 가로 scroll 방지
        - overflow-x-auto: 보드 내부에서만 가로 scroll
        - 높이 고정: 컬럼 세로 scroll 동작을 위해 필수
        ────────────────────────────────────────────────────────────────────────
      */}
      <div
        className="flex gap-3 min-w-0 overflow-x-auto"
        style={{
          height: 'calc(100vh - 275px)',
          minHeight: 380,
          paddingBottom: 4,
          /* 스크롤바 최대한 얇게 */
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(168,153,139,0.5) transparent',
        }}
      >
        {COLUMNS.map((col) => {
          const { status, label, dotColor, headerBg, textColor, dropRingColor, dropBg } = col;
          const colTickets = grouped[status] ?? [];
          const isOver     = dropTarget === status;
          const canDrop    = isDroppable(status);

          return (
            <div
              key={status}
              className="flex flex-col flex-shrink-0 rounded-xl overflow-hidden transition-all duration-150"
              style={{
                width: 240,
                // 드롭 가능 컬럼: 링 표시 / 불가능 컬럼: 약간 dim
                outline: isOver && canDrop ? `2px solid ${dropRingColor}` : '2px solid transparent',
                outlineOffset: 0,
                opacity: dragging && !canDrop && !isOver ? 0.65 : 1,
                background: '#f5f4f1',
              }}
              onDragOver={(e) => { e.preventDefault(); setDropTarget(status); }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
              }}
              onDrop={(e) => { e.preventDefault(); handleDrop(status); }}
            >
              {/* ── Column Header ── */}
              <div
                className="flex items-center justify-between px-3.5 py-2.5 flex-shrink-0"
                style={{ background: isOver && canDrop ? dropBg : headerBg }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: dotColor }}
                  />
                  <span className="text-[13px] font-semibold" style={{ color: textColor }}>
                    {label}
                  </span>
                </div>
                <span
                  className="text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(255,255,255,0.7)',
                    color: textColor,
                    minWidth: 20,
                    textAlign: 'center',
                  }}
                >
                  {colTickets.length}
                </span>
              </div>

              {/* ── 구분선 ── */}
              <div className="h-px flex-shrink-0" style={{ background: 'rgba(0,0,0,0.06)' }} />

              {/* ── Cards area (이 영역만 세로 스크롤) ── */}
              <div
                className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1.5"
                style={{
                  background: isOver && canDrop ? dropBg : 'transparent',
                  transition: 'background 0.12s',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(168,153,139,0.35) transparent',
                }}
              >
                {colTickets.length === 0 ? (
                  <div
                    className="flex items-center justify-center flex-1 rounded-lg mx-0.5 my-1 text-xs transition-all duration-150"
                    style={{
                      minHeight: 72,
                      border: `1.5px dashed ${isOver && canDrop ? dropRingColor : 'rgba(0,0,0,0.1)'}`,
                      color: isOver && canDrop ? dropRingColor : 'rgba(0,0,0,0.3)',
                      background: isOver && canDrop ? dropBg : 'transparent',
                    }}
                  >
                    {canDrop && isOver ? '여기에 놓기' : '티켓 없음'}
                  </div>
                ) : (
                  colTickets.map((ticket) => (
                    <KanbanCard
                      key={ticket.id}
                      ticket={ticket}
                      user={user}
                      isDragging={dragging?.id === ticket.id}
                      onClick={() => onCardClick(ticket.id)}
                      onDragStart={(e) => {
                        setDragging(ticket);
                        e.dataTransfer.effectAllowed = 'move';
                        // 커스텀 drag ghost: 약간 작게
                        e.dataTransfer.setDragImage(e.currentTarget as HTMLElement, 20, 20);
                      }}
                      onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                      pickingUpId={pickingUpId}
                      cancellingId={cancellingId}
                      onPickup={() => onPickup(ticket.id)}
                      onCancelPickup={() => onCancelPickup(ticket.id)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 사유 입력 모달 ── */}
      {reasonModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)' }}
          onClick={() => !submitting && setReasonModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-2xl"
            style={{ border: '1px solid rgba(0,0,0,0.08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-[15px] font-semibold text-gray-900">
                  {COLUMNS.find((c) => c.status === reasonModal.targetStatus)?.label}(으)로 변경
                </h3>
                <p className="mt-0.5 text-[12.5px] text-gray-400">상태 변경 사유를 입력해주세요.</p>
              </div>
              <button
                onClick={() => !submitting && setReasonModal(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="px-5 py-4 space-y-3">
              <MentionInput
                value={reason}
                onChange={setReason}
                placeholder="사유를 입력하세요... (@username 멘션 가능)"
                rows={3}
                className="dt-textarea w-full"
              />
              {reasonError && (
                <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-1.5">
                  {reasonError}
                </p>
              )}
            </div>

            {/* 모달 액션 */}
            <div className="flex gap-2 px-5 pb-5">
              <button
                className="dt-btn dt-btn-primary flex-1"
                onClick={handleReasonSubmit}
                disabled={submitting}
              >
                {submitting ? '처리 중...' : '확인'}
              </button>
              <button
                className="dt-btn dt-btn-secondary"
                onClick={() => setReasonModal(null)}
                disabled={submitting}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default KanbanBoard;

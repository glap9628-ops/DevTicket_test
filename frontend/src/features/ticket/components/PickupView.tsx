import { useState, useEffect, useCallback } from 'react';
import { getTickets, pickupTicket, cancelPickup } from '@/features/ticket/api';
import type { TicketSummary, TicketType } from '@/types/ticket';
import type { User } from '@/types/auth';
import {
  TICKET_TYPE_LABEL,
  DIFFICULTY_LABEL, DIFFICULTY_COLOR,
  PRIORITY_LABEL, PRIORITY_COLOR,
} from '@/types/ticket';

interface Props {
  user: User | null;
  onCardClick: (id: number) => void;
}

// ─── 타입별 상단 컬러 바 ─────────────────────────────────────────────
const TYPE_BAR_COLOR: Record<number, string> = {
  1: 'linear-gradient(90deg,#ef4444,#f87171)',   // QA오류
  2: 'linear-gradient(90deg,#f59e0b,#fcd34d)',   // 데브옵스
  3: 'linear-gradient(90deg,#3b82f6,#93c5fd)',   // 내부개발
  4: 'linear-gradient(90deg,#10b981,#6ee7b7)',   // 운영요청
  5: 'linear-gradient(90deg,#8b5cf6,#c4b5fd)',   // 유지보수
};

const AVATAR_COLORS = [
  '#6366f1','#3b82f6','#10b981','#f59e0b',
  '#ef4444','#8b5cf6','#ec4899','#14b8a6',
];
const avatarColor = (name: string) =>
  AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

const formatDateShort = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// ─── 통계 칩 ─────────────────────────────────────────────────────────
const StatChip = ({ color, value, label }: { color: string; value: number; label: string }) => (
  <div className="flex items-center gap-2.5 bg-white border border-[var(--dt-border)] rounded-xl px-4 py-3 flex-1 min-w-[110px]">
    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
    <div>
      <div className="text-xl font-extrabold text-gray-900 leading-none">{value}</div>
      <div className="text-[10.5px] text-gray-400 mt-1">{label}</div>
    </div>
  </div>
);

// ─── 티켓 카드 ───────────────────────────────────────────────────────
const TicketCard = ({
  ticket, user,
  pickingUpId, cancellingId,
  onPickup, onCancel, onCardClick,
}: {
  ticket: TicketSummary;
  user: User | null;
  pickingUpId: number | null;
  cancellingId: number | null;
  onPickup: (id: number) => void;
  onCancel: (id: number) => void;
  onCardClick: (id: number) => void;
}) => {
  const isMine   = ticket.assigneeId != null && ticket.assigneeId === user?.id;
  const isTaken  = ticket.assigneeId != null && ticket.assigneeId !== user?.id;
  const isLoading = pickingUpId === ticket.id || cancellingId === ticket.id;

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden transition-all duration-150 cursor-pointer"
      style={{
        border: isMine
          ? '2px solid #6366f1'
          : isTaken
          ? '1.5px solid #e5e2db'
          : '1.5px solid #e5e2db',
        opacity: isTaken ? 0.62 : 1,
        boxShadow: isMine ? '0 0 0 3px rgba(99,102,241,0.1)' : undefined,
      }}
      onClick={() => onCardClick(ticket.id)}
    >
      {/* 상단 컬러 바 */}
      <div style={{ height: 3, background: ticket.isUrgent ? 'linear-gradient(90deg,#ef4444,#f87171)' : TYPE_BAR_COLOR[ticket.ticketType] ?? '#e5e2db' }} />

      <div className="p-4">
        {/* 메타 */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
          <span className="font-mono text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{ticket.ticketNo}</span>
          {ticket.isUrgent && (
            <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-md">
              🚨 긴급
            </span>
          )}
          {ticket.difficulty != null && (
            <span className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md ${DIFFICULTY_COLOR[ticket.difficulty] ?? ''}`}>
              난이도 {DIFFICULTY_LABEL[ticket.difficulty]}
            </span>
          )}
          {isMine && (
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md ml-auto">
              내가 픽업
            </span>
          )}
        </div>

        {/* 제목 */}
        <p className="text-[13.5px] font-bold text-gray-900 leading-snug mb-3 line-clamp-2">
          {ticket.title}
        </p>

        {/* 태그 */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {ticket.priority != null && (
            <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-md ${PRIORITY_COLOR[ticket.priority] ?? ''}`}>
              {PRIORITY_LABEL[ticket.priority]}
            </span>
          )}
          <span
            className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md"
            style={{ background: 'rgba(160,112,64,0.1)', color: '#7a5028' }}
          >
            {TICKET_TYPE_LABEL[ticket.ticketType as TicketType]}
          </span>
          {ticket.productName && (
            <span className="text-[10.5px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md font-medium">
              {ticket.productName}
            </span>
          )}
          <span className="text-[10px] text-gray-400 ml-auto">{formatDateShort(ticket.createdAt)} 등록</span>
        </div>

        {/* 구분선 */}
        <div className="h-px bg-gray-100 -mx-4 mb-3" />

        {/* 푸터 */}
        <div className="flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
          {/* 요청자 */}
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-extrabold text-white flex-shrink-0"
              style={{ background: avatarColor(ticket.requesterName) }}
            >
              {ticket.requesterName.slice(-2, -1)}
            </div>
            <div className="min-w-0">
              <p className="text-[11.5px] text-gray-600 font-medium truncate">{ticket.requesterName}</p>
              {ticket.requestingDept && (
                <p className="text-[10px] text-gray-400 truncate">{ticket.requestingDept}</p>
              )}
            </div>
          </div>

          {/* 픽업 버튼 */}
          {isTaken ? (
            <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-2.5 py-1.5 flex-shrink-0">
              <div
                className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-extrabold text-white"
                style={{ background: avatarColor(ticket.assigneeName ?? '?') }}
              >
                {(ticket.assigneeName ?? '?').slice(-2, -1)}
              </div>
              <span className="text-[10.5px] text-gray-500 font-medium whitespace-nowrap">
                {ticket.assigneeName} 픽업중
              </span>
            </div>
          ) : isMine ? (
            <button
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-colors flex-shrink-0"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1.5px solid rgba(239,68,68,0.2)' }}
              disabled={isLoading}
              onClick={() => onCancel(ticket.id)}
            >
              {cancellingId === ticket.id ? '...' : '✕ 픽업 취소'}
            </button>
          ) : (
            <button
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11.5px] font-bold text-white transition-all flex-shrink-0 hover:opacity-90 active:scale-95"
              style={{ background: '#a07040' }}
              disabled={isLoading}
              onClick={() => onPickup(ticket.id)}
            >
              {pickingUpId === ticket.id ? '...' : '⚡ 픽업하기'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────
const PickupView = ({ user, onCardClick }: Props) => {
  const [tickets, setTickets]         = useState<TicketSummary[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [pickingUpId, setPickingUpId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // ── 필터 상태 ──────────────────────────────────────────────────────
  const [typeFilter, setTypeFilter]       = useState<TicketType | ''>('');
  const [diffFilter, setDiffFilter]       = useState<number | ''>('');
  const [urgentOnly, setUrgentOnly]       = useState(false);
  const [keyword, setKeyword]             = useState('');

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getTickets({ status: 3, size: 200 });
      setTickets(res.content);
    } catch {
      setError('티켓을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const handlePickup = async (id: number) => {
    setPickingUpId(id);
    try {
      await pickupTicket(id);
      fetchTickets();
    } catch (e) {
      alert(e instanceof Error ? e.message : '픽업 처리에 실패했습니다.');
    } finally {
      setPickingUpId(null);
    }
  };

  const handleCancel = async (id: number) => {
    setCancellingId(id);
    try {
      await cancelPickup(id);
      fetchTickets();
    } catch (e) {
      alert(e instanceof Error ? e.message : '픽업 취소에 실패했습니다.');
    } finally {
      setCancellingId(null);
    }
  };

  // ── 필터링 ────────────────────────────────────────────────────────
  const filtered = tickets.filter((t) => {
    if (typeFilter !== '' && t.ticketType !== typeFilter) return false;
    if (diffFilter !== '' && t.difficulty !== diffFilter) return false;
    if (urgentOnly && !t.isUrgent) return false;
    if (keyword && !t.title.toLowerCase().includes(keyword.toLowerCase())) return false;
    return true;
  });

  // ── 정렬: 긴급 먼저, 그 다음 우선순위 높은 것, 그 다음 픽업 가능한 것
  const sorted = [...filtered].sort((a, b) => {
    if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
    const pA = a.priority ?? 0, pB = b.priority ?? 0;
    if (pA !== pB) return pB - pA;
    const aAvail = a.assigneeId == null ? 0 : 1;
    const bAvail = b.assigneeId == null ? 0 : 1;
    return aAvail - bAvail;
  });

  // ── 통계 ──────────────────────────────────────────────────────────
  const totalCnt   = tickets.length;
  const urgentCnt  = tickets.filter(t => t.isUrgent).length;

  const typeButtons: Array<{ label: string; value: TicketType | '' }> = [
    { label: '전체',          value: '' },
    { label: 'QA오류',        value: 1 },
    { label: '장애/오류',     value: 2 },
    { label: '신규개발/개선', value: 3 },
    { label: '고객요청',      value: 4 },
  ];

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-sm text-gray-400">
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      불러오는 중...
    </div>
  );

  if (error) return (
    <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-600 flex items-center justify-between">
      <span>{error}</span>
      <button onClick={fetchTickets} className="text-xs underline">다시 시도</button>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── 통계 요약 ── */}
      <div className="flex gap-3 flex-wrap">
        <StatChip color="#6366f1" value={totalCnt}  label="진행가능 전체" />
        <StatChip color="#ef4444" value={urgentCnt} label="긴급 티켓" />
      </div>

      {/* ── 필터 바 ── */}
      <div
        className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap"
        style={{ border: '1px solid var(--dt-border)' }}
      >
        {/* 유형 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {typeButtons.map(({ label, value }) => (
            <button
              key={String(value)}
              onClick={() => setTypeFilter(value)}
              className={`dt-filter-btn${typeFilter === value ? ' active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-gray-200 flex-shrink-0" />

        {/* 난이도 */}
        <div className="flex items-center gap-1">
          {([['', '난이도 전체'], [3, '상'], [2, '중'], [1, '하']] as Array<[number | '', string]>).map(([v, lbl]) => (
            <button
              key={String(v)}
              onClick={() => setDiffFilter(v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                diffFilter === v
                  ? v === 3 ? 'bg-red-100 text-red-700'
                  : v === 2 ? 'bg-amber-100 text-amber-700'
                  : v === 1 ? 'bg-green-100 text-green-700'
                  : 'bg-gray-200 text-gray-700'
                  : 'text-gray-400 hover:bg-gray-100'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-gray-200 flex-shrink-0" />

        {/* 긴급 토글 */}
        <button
          onClick={() => setUrgentOnly(!urgentOnly)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            urgentOnly
              ? 'bg-red-50 text-red-600 border-red-200'
              : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
          }`}
        >
          🚨 긴급만 보기
        </button>

        {/* 검색 */}
        <div className="ml-auto">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="제목 검색..."
            className="dt-input w-40 text-sm"
          />
        </div>

        {/* 새로고침 */}
        <button
          onClick={fetchTickets}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="새로고침"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>

      {/* ── 카드 그리드 ── */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: 'var(--dt-text-muted)' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <p className="text-sm">픽업 가능한 티켓이 없습니다.</p>
          {(typeFilter !== '' || diffFilter !== '' || urgentOnly || keyword) && (
            <button
              className="text-xs underline"
              onClick={() => { setTypeFilter(''); setDiffFilter(''); setUrgentOnly(false); setKeyword(''); }}
            >
              필터 초기화
            </button>
          )}
        </div>
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
        >
          {sorted.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              user={user}
              pickingUpId={pickingUpId}
              cancellingId={cancellingId}
              onPickup={handlePickup}
              onCancel={handleCancel}
              onCardClick={onCardClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PickupView;

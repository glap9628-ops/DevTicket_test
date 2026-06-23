import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getTickets, changeStatus, pickupTicket, cancelPickup } from '@/features/ticket/api';
import { getMe } from '@/features/auth/api';
import StatusBadge from '@/components/ui/StatusBadge';
import TypeBadge from '@/components/ui/TypeBadge';
import KanbanBoard from '@/features/ticket/components/KanbanBoard';
import type { TicketSummary, TicketStatus } from '@/types/ticket';
import type { User } from '@/types/auth';

type Tab = 'requested' | 'assigned' | 'done';
type ViewMode = 'list' | 'kanban';

const LS_VIEW_KEY = 'dt_view_preference';
const PAGE_SIZE = 20;
const KANBAN_SIZE = 200;

/* ── Shared ticket table ─────────────────────────────────── */
const TicketTable = ({
  tickets, loading, navigate, formatDate, actionSlot,
}: {
  tickets: TicketSummary[];
  loading: boolean;
  navigate: (p: string) => void;
  formatDate: (iso: string) => string;
  actionSlot?: (t: TicketSummary) => React.ReactNode;
}) => {
  if (loading) return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <svg className="animate-spin w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      불러오는 중...
    </div>
  );
  if (tickets.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
      티켓이 없습니다.
    </div>
  );
  return (
    <table className="dt-table">
      <colgroup>
        <col style={{ width: '100px' }} />{/* 티켓번호 */}
        <col />                             {/* 제목 */}
        <col style={{ width: '80px' }} />  {/* 플랫폼 */}
        <col style={{ width: '90px' }} />  {/* 제품 */}
        <col style={{ width: '90px' }} />  {/* 타입 */}
        <col style={{ width: '90px' }} />  {/* 상태 */}
        <col style={{ width: '85px' }} />  {/* 요청자 */}
        <col style={{ width: '95px' }} />  {/* 등록일 */}
        {actionSlot && <col style={{ width: '64px' }} />}
      </colgroup>
      <thead>
        <tr>
          <th>티켓번호</th>
          <th>제목</th>
          <th className="dt-col-center">플랫폼</th>
          <th className="dt-col-center">제품</th>
          <th className="dt-col-center">타입</th>
          <th className="dt-col-center">상태</th>
          <th className="dt-col-center">요청자</th>
          <th className="dt-col-center">등록일</th>
          {actionSlot && <th className="dt-col-center">작업</th>}
        </tr>
      </thead>
      <tbody>
        {tickets.map((ticket) => (
          <tr key={ticket.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/tickets/${ticket.id}`)}>
            <td>
              <span className="font-mono text-xs text-[var(--dt-primary)]">
                {ticket.ticketNo}
              </span>
            </td>
            <td className="dt-col-title">
              <div className="flex items-center gap-2">
                {ticket.isUrgent && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700 flex-shrink-0">긴급</span>
                )}
                <span className="text-gray-900 font-medium">
                  {ticket.title}
                </span>
              </div>
            </td>
            <td className="dt-col-center">
              {ticket.platform ? (
                <span
                  className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold"
                  style={{
                    background: ticket.platform === 'MANAGER' ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.1)',
                    color: ticket.platform === 'MANAGER' ? '#4f46e5' : '#059669',
                  }}
                >
                  {ticket.platform}
                </span>
              ) : (
                <span className="text-xs text-gray-300">-</span>
              )}
            </td>
            <td className="dt-col-center text-xs font-medium text-gray-600">
              {ticket.productName ?? <span className="text-gray-300">-</span>}
            </td>
            <td className="dt-col-center"><TypeBadge type={ticket.ticketType} showLabel /></td>
            <td className="dt-col-center"><StatusBadge status={ticket.status} /></td>
            <td className="dt-col-center text-sm text-gray-600">{ticket.requesterName}</td>
            <td className="dt-col-center text-sm text-gray-500">{formatDate(ticket.createdAt)}</td>
            {actionSlot && <td className="dt-col-center" onClick={(e) => e.stopPropagation()}>{actionSlot(ticket)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

/* ── Page ────────────────────────────────────────────────── */
const MyTicketsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState<User | null>(null);

  const rawTab = searchParams.get('tab');
  const tab: Tab = rawTab === 'assigned' ? 'assigned' : rawTab === 'done' ? 'done' : 'requested';

  const handleTabChange = (t: Tab) => {
    setSearchParams((prev) => { prev.set('tab', t); return prev; }, { replace: true });
  };

  // View mode (shared with TicketBoardPage via localStorage)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const url = searchParams.get('view');
    if (url === 'list' || url === 'kanban') return url;
    return (localStorage.getItem(LS_VIEW_KEY) as ViewMode) ?? 'list';
  });

  // URL 변화(사이드바 클릭 등) 시 viewMode 동기화
  useEffect(() => {
    const url = searchParams.get('view');
    if (url === 'list' || url === 'kanban') setViewMode(url);
  }, [searchParams]);

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(LS_VIEW_KEY, mode);
    setSearchParams((prev) => { prev.set('view', mode); return prev; }, { replace: true });
  };

  // ── List state ─────────────────────────────────────────────
  const [reqTickets, setReqTickets]       = useState<TicketSummary[]>([]);
  const [reqTotal, setReqTotal]           = useState(0);
  const [reqPage, setReqPage]             = useState(0);
  const [reqLoading, setReqLoading]       = useState(true);

  const [assignedTickets, setAssignedTickets] = useState<TicketSummary[]>([]);
  const [assignedTotal, setAssignedTotal]     = useState(0);
  const [assignedPage, setAssignedPage]       = useState(0);
  const [assignedLoading, setAssignedLoading] = useState(false);

  const [doneTickets, setDoneTickets]   = useState<TicketSummary[]>([]);
  const [doneTotal, setDoneTotal]       = useState(0);
  const [donePage, setDonePage]         = useState(0);
  const [doneLoading, setDoneLoading]   = useState(false);

  // ── Kanban state ───────────────────────────────────────────
  const [kanbanTickets, setKanbanTickets] = useState<TicketSummary[]>([]);
  const [kanbanLoading, setKanbanLoading] = useState(false);

  // ── Pickup ─────────────────────────────────────────────────
  const [pickingUpId, setPickingUpId]   = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // ── Reopen modal ───────────────────────────────────────────
  const [reopenId, setReopenId]       = useState<number | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenError, setReopenError]  = useState('');
  const [reopenLoading, setReopenLoading] = useState(false);

  useEffect(() => { getMe().then(setUser).catch(() => navigate('/login')); }, [navigate]);


  const fetchRequested = useCallback(async () => {
    if (!user) return;
    setReqLoading(true);
    try {
      const res = await getTickets({ page: reqPage, size: PAGE_SIZE, requesterId: user.id });
      setReqTickets(res.content);
      setReqTotal(res.totalCount);
    } catch { /**/ } finally { setReqLoading(false); }
  }, [user, reqPage]);

  const fetchAssigned = useCallback(async () => {
    if (!user) return;
    setAssignedLoading(true);
    try {
      const res = await getTickets({ page: assignedPage, size: PAGE_SIZE, assigneeId: user.id });
      setAssignedTickets(res.content);
      setAssignedTotal(res.totalCount);
    } catch { /**/ } finally { setAssignedLoading(false); }
  }, [user, assignedPage]);

  const fetchDone = useCallback(async () => {
    if (!user) return;
    setDoneLoading(true);
    try {
      // 개발자/관리자는 자신이 담당한 완료 티켓, 요청자는 자신이 요청한 완료 티켓
      const isDev = user.role === 'DEVELOPER' || user.role === 'ADMIN';
      const filter = isDev
        ? { assigneeId: user.id, status: 6 as const }
        : { requesterId: user.id, status: 6 as const };
      const res = await getTickets({ ...filter, page: donePage, size: PAGE_SIZE });
      setDoneTickets(res.content);
      setDoneTotal(res.totalCount);
    } catch { /**/ } finally { setDoneLoading(false); }
  }, [user, donePage]);

  const fetchKanban = useCallback(async () => {
    if (!user) return;
    setKanbanLoading(true);
    try {
      const isDev = user.role === 'DEVELOPER' || user.role === 'ADMIN';
      const params = tab === 'requested'
        ? { requesterId: user.id }
        : tab === 'done'
          ? isDev
            ? { assigneeId: user.id, status: 6 as const }
            : { requesterId: user.id, status: 6 as const }
          : { assigneeId: user.id };
      const res = await getTickets({ ...params, page: 0, size: KANBAN_SIZE });
      setKanbanTickets(res.content);
    } catch { /**/ } finally { setKanbanLoading(false); }
  }, [user, tab]);

  useEffect(() => { fetchRequested(); }, [fetchRequested]);
  useEffect(() => { fetchAssigned(); }, [fetchAssigned]);
  useEffect(() => { fetchDone(); }, [fetchDone]);
  useEffect(() => { if (viewMode === 'kanban') fetchKanban(); }, [viewMode, fetchKanban]);

  const handlePickup = async (ticketId: number) => {
    setPickingUpId(ticketId);
    try { await pickupTicket(ticketId); fetchKanban(); } catch { /**/ } finally { setPickingUpId(null); }
  };

  const handleCancelPickup = async (ticketId: number) => {
    setCancellingId(ticketId);
    try { await cancelPickup(ticketId); fetchKanban(); } catch { /**/ } finally { setCancellingId(null); }
  };

  const handleStatusChange = async (ticketId: number, newStatus: TicketStatus, reason?: string) => {
    await changeStatus(ticketId, { toStatus: newStatus, reason });
    fetchKanban();
  };

  const handleReopenConfirm = async () => {
    if (!reopenId || !reopenReason.trim()) { setReopenError('사유를 입력해주세요.'); return; }
    setReopenLoading(true);
    try {
      await changeStatus(reopenId, { toStatus: 4, reason: reopenReason.trim() });
      setReopenId(null);
      setReopenReason('');
      fetchRequested();
    } catch {
      setReopenError('재오픈 처리 중 오류가 발생했습니다.');
    } finally {
      setReopenLoading(false);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const reqPages      = Math.ceil(reqTotal / PAGE_SIZE);
  const assignedPages = Math.ceil(assignedTotal / PAGE_SIZE);
  const donePages     = Math.ceil(doneTotal / PAGE_SIZE);

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'requested', label: '요청한 티켓', count: reqTotal },
    { key: 'assigned',  label: '담당 티켓',   count: assignedTotal },
    { key: 'done',      label: '완료 티켓',   count: doneTotal },
  ];

  return (
    <div className="dt-page">
      {/* Header */}
      <div className="dt-page-header">
        <div>
          <h1 className="dt-page-title">내 티켓</h1>
          <p className="dt-page-subtitle">나와 관련된 티켓 목록</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => handleViewChange('list')}
              title="리스트 뷰"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'list' ? 'bg-[var(--dt-primary-dark)] text-white' : 'text-gray-500 hover:bg-[var(--dt-bg)]'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              리스트
            </button>
            <button
              onClick={() => handleViewChange('kanban')}
              title="칸반 뷰"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'kanban' ? 'bg-[var(--dt-primary-dark)] text-white' : 'text-gray-500 hover:bg-[var(--dt-bg)]'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="5" height="18" rx="1" /><rect x="10" y="3" width="5" height="11" rx="1" /><rect x="17" y="3" width="5" height="15" rx="1" />
              </svg>
              칸반
            </button>
          </div>

          <button className="dt-btn dt-btn-primary" onClick={() => navigate('/tickets/new')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            티켓 등록
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-[var(--dt-primary)] text-[var(--dt-primary)]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${tab === key ? 'bg-[var(--dt-primary-light)] text-[var(--dt-primary)]' : 'bg-gray-100 text-gray-500'}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Kanban view ── */}
      {viewMode === 'kanban' && (
        <KanbanBoard
          tickets={kanbanTickets}
          user={user}
          loading={kanbanLoading}
          onStatusChange={handleStatusChange}
          onCardClick={(id) => navigate(`/tickets/${id}`)}
          onPickup={handlePickup}
          onCancelPickup={handleCancelPickup}
          pickingUpId={pickingUpId}
          cancellingId={cancellingId}
        />
      )}

      {/* ── List view ── */}
      {viewMode === 'list' && (
        <>
          {tab === 'requested' && (
            <>
              <div className="dt-card overflow-hidden">
                <TicketTable
                  tickets={reqTickets}
                  loading={reqLoading}
                  navigate={navigate}
                  formatDate={formatDate}
                  actionSlot={(ticket) =>
                    ticket.status === 6 ? (
                      <button
                        className="text-xs text-[var(--dt-primary)] hover:underline"
                        onClick={() => { setReopenId(ticket.id); setReopenReason(''); setReopenError(''); }}
                      >
                        재오픈
                      </button>
                    ) : null
                  }
                />
              </div>
              {reqPages > 1 && (
                <div className="dt-pagination">
                  <button className="dt-btn dt-btn-secondary" disabled={reqPage === 0} onClick={() => setReqPage((p) => p - 1)}>이전</button>
                  <span className="text-sm text-gray-600">{reqPage + 1} / {reqPages}</span>
                  <button className="dt-btn dt-btn-secondary" disabled={reqPage >= reqPages - 1} onClick={() => setReqPage((p) => p + 1)}>다음</button>
                </div>
              )}
            </>
          )}

          {tab === 'assigned' && (
            <>
              <div className="dt-card overflow-hidden">
                <TicketTable
                  tickets={assignedTickets}
                  loading={assignedLoading}
                  navigate={navigate}
                  formatDate={formatDate}
                />
              </div>
              {assignedPages > 1 && (
                <div className="dt-pagination">
                  <button className="dt-btn dt-btn-secondary" disabled={assignedPage === 0} onClick={() => setAssignedPage((p) => p - 1)}>이전</button>
                  <span className="text-sm text-gray-600">{assignedPage + 1} / {assignedPages}</span>
                  <button className="dt-btn dt-btn-secondary" disabled={assignedPage >= assignedPages - 1} onClick={() => setAssignedPage((p) => p + 1)}>다음</button>
                </div>
              )}
            </>
          )}

          {tab === 'done' && (
            <>
              <div className="dt-card overflow-hidden">
                <TicketTable
                  tickets={doneTickets}
                  loading={doneLoading}
                  navigate={navigate}
                  formatDate={formatDate}
                />
              </div>
              {donePages > 1 && (
                <div className="dt-pagination">
                  <button className="dt-btn dt-btn-secondary" disabled={donePage === 0} onClick={() => setDonePage((p) => p - 1)}>이전</button>
                  <span className="text-sm text-gray-600">{donePage + 1} / {donePages}</span>
                  <button className="dt-btn dt-btn-secondary" disabled={donePage >= donePages - 1} onClick={() => setDonePage((p) => p + 1)}>다음</button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Reopen modal */}
      {reopenId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">티켓 재오픈</h3>
            <label className="dt-label">재오픈 사유 <span className="text-red-500">*</span></label>
            <textarea
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="재오픈 사유를 입력해주세요."
              rows={3}
              className="dt-textarea w-full mt-1"
            />
            {reopenError && <p className="text-sm text-red-600 mt-2">{reopenError}</p>}
            <div className="flex gap-2 mt-5">
              <button className="dt-btn dt-btn-primary" onClick={handleReopenConfirm} disabled={reopenLoading}>
                {reopenLoading ? '처리 중...' : '재오픈'}
              </button>
              <button className="dt-btn dt-btn-secondary" onClick={() => setReopenId(null)} disabled={reopenLoading}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyTicketsPage;

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getTickets, pickupTicket, cancelPickup, changeStatus } from '@/features/ticket/api';
import { getMe } from '@/features/auth/api';
import StatusBadge from '@/components/ui/StatusBadge';
import TypeBadge from '@/components/ui/TypeBadge';
import KanbanBoard from '@/features/ticket/components/KanbanBoard';
import PickupView from '@/features/ticket/components/PickupView';
import type { TicketSummary, TicketType, TicketStatus } from '@/types/ticket';
import type { User } from '@/types/auth';
import { PRODUCT_OPTIONS, PLATFORM_OPTIONS } from '@/types/ticket';

type ViewMode = 'list' | 'kanban' | 'pickup';
const LS_VIEW_KEY = 'dt_view_preference';
const LIST_PAGE_SIZE = 20;
const KANBAN_SIZE = 200;

const TicketBoardPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── View mode ──────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const url = searchParams.get('view');
    if (url === 'list' || url === 'kanban' || url === 'pickup') return url;
    return (localStorage.getItem(LS_VIEW_KEY) as ViewMode) ?? 'list';
  });

  useEffect(() => {
    const url = searchParams.get('view');
    if (url === 'list' || url === 'kanban' || url === 'pickup') setViewMode(url);
  }, [searchParams]);

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(LS_VIEW_KEY, mode);
    setSearchParams((prev) => { prev.set('view', mode); return prev; }, { replace: true });
  };

  // ── Auth ───────────────────────────────────────────────────
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => { getMe().then(setUser).catch(() => {}); }, []);

  // ── Filters ────────────────────────────────────────────────
  const [typeFilter, setTypeFilter]       = useState<TicketType | ''>('');
  const [statusFilter, setStatusFilter]   = useState<TicketStatus | ''>(() => {
    const s = searchParams.get('status');
    return s ? (parseInt(s, 10) as TicketStatus) : '';
  });
  const [urgentOnly, setUrgentOnly]       = useState(() => searchParams.get('urgent') === 'true');
  const [productFilter, setProductFilter]   = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [keyword, setKeyword]               = useState('');
  const [keywordInput, setKeywordInput]   = useState('');

  // ── List state ─────────────────────────────────────────────
  const [listTickets, setListTickets]     = useState<TicketSummary[]>([]);
  const [totalCount, setTotalCount]       = useState(0);
  const [page, setPage]                   = useState(0);
  const [listLoading, setListLoading]     = useState(false);
  const [listError, setListError]         = useState('');

  // ── Kanban state ───────────────────────────────────────────
  const [kanbanTickets, setKanbanTickets] = useState<TicketSummary[]>([]);
  const [kanbanLoading, setKanbanLoading] = useState(false);
  const [kanbanError, setKanbanError]     = useState('');

  // ── Pickup state ───────────────────────────────────────────
  const [pickingUpId, setPickingUpId]     = useState<number | null>(null);
  const [cancellingId, setCancellingId]   = useState<number | null>(null);


  const buildFilterParams = useCallback(() => ({
    ticketType:  typeFilter,
    status:      statusFilter,
    isUrgent:    urgentOnly || undefined,
    keyword:     keyword || undefined,
    productName: productFilter || undefined,
    platform:    platformFilter || undefined,
  }), [typeFilter, statusFilter, urgentOnly, keyword, productFilter, platformFilter]);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const res = await getTickets({ ...buildFilterParams(), page, size: LIST_PAGE_SIZE });
      setListTickets(res.content);
      setTotalCount(res.totalCount);
    } catch (e) {
      setListError(e instanceof Error ? e.message : '티켓 목록을 불러오지 못했습니다.');
    } finally { setListLoading(false); }
  }, [page, buildFilterParams]);

  const fetchKanban = useCallback(async () => {
    setKanbanLoading(true);
    setKanbanError('');
    try {
      const { status: _s, ...rest } = buildFilterParams();
      const res = await getTickets({ ...rest, page: 0, size: KANBAN_SIZE });
      setKanbanTickets(res.content);
    } catch (e) {
      setKanbanError(e instanceof Error ? e.message : '칸반 데이터를 불러오지 못했습니다.');
    } finally { setKanbanLoading(false); }
  }, [buildFilterParams]);

  useEffect(() => {
    if (viewMode === 'list') fetchList();
    else if (viewMode === 'kanban') fetchKanban();
    // pickup view manages its own data fetch internally
  }, [viewMode, fetchList, fetchKanban]);

  // ── Handlers ───────────────────────────────────────────────
  const canPickup = user?.role === 'DEVELOPER' || user?.role === 'ADMIN';
  const isMine = (t: TicketSummary) => user !== null && t.assigneeId === user.id;

  const handlePickup = async (e: React.MouseEvent, ticketId: number) => {
    e.stopPropagation();
    setPickingUpId(ticketId);
    try {
      await pickupTicket(ticketId);
      viewMode === 'list' ? fetchList() : fetchKanban();
    } catch (e) {
      alert(e instanceof Error ? e.message : '픽업 처리에 실패했습니다.');
    } finally { setPickingUpId(null); }
  };

  const handleCancelPickup = async (e: React.MouseEvent, ticketId: number) => {
    e.stopPropagation();
    setCancellingId(ticketId);
    try {
      await cancelPickup(ticketId);
      viewMode === 'list' ? fetchList() : fetchKanban();
    } catch (e) {
      alert(e instanceof Error ? e.message : '픽업 취소에 실패했습니다.');
    } finally { setCancellingId(null); }
  };

  const handleStatusChange = async (ticketId: number, newStatus: TicketStatus, reason?: string) => {
    try {
      await changeStatus(ticketId, { toStatus: newStatus, reason });
      fetchKanban();
    } catch (e) {
      alert(e instanceof Error ? e.message : '상태 변경에 실패했습니다.');
    }
  };

  const handleSearch = () => { setKeyword(keywordInput); setPage(0); };
  const resetPage    = () => setPage(0);
  const totalPages   = Math.ceil(totalCount / LIST_PAGE_SIZE);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const typeButtons: Array<{ label: string; value: TicketType | '' }> = [
    { label: '전체',        value: '' },
    { label: 'QA오류',      value: 1 },
    { label: '장애/오류',   value: 2 },
    { label: '신규개발/개선', value: 3 },
    { label: '고객요청',    value: 4 },
  ];

  const statusOptions: Array<{ label: string; value: TicketStatus | '' }> = [
    { label: '전체 상태', value: '' },
    { label: '검토대기',  value: 1 },
    { label: '픽업대기',  value: 3 },
    { label: '진행중',   value: 4 },
    { label: 'QA검증',   value: 5 },
    { label: '완료',     value: 6 },
    { label: '보류',     value: 7 },
    { label: '반려',     value: 8 },
  ];

  return (
    <div className="dt-page">
      {/* ── Page header ── */}
      <div className="dt-page-header">
        <div>
          <h1 className="dt-page-title">전체 티켓</h1>
          <p className="dt-page-subtitle">
            {viewMode === 'pickup' ? '픽업 가능한 티켓 목록' : `전체 티켓 목록 (${totalCount}건)`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div
            className="flex items-center rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--dt-border)' }}
          >
            <button
              onClick={() => handleViewChange('list')}
              title="리스트 뷰"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'list'
                  ? 'text-white'
                  : 'hover:bg-[var(--dt-bg)]'
              }`}
              style={
                viewMode === 'list'
                  ? { backgroundColor: 'var(--dt-primary-dark)', color: '#fff' }
                  : { color: 'var(--dt-text-muted)' }
              }
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
                viewMode === 'kanban'
                  ? 'text-white'
                  : 'hover:bg-[var(--dt-bg)]'
              }`}
              style={
                viewMode === 'kanban'
                  ? { backgroundColor: 'var(--dt-primary-dark)', color: '#fff' }
                  : { color: 'var(--dt-text-muted)' }
              }
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="5" height="18" rx="1" /><rect x="10" y="3" width="5" height="11" rx="1" /><rect x="17" y="3" width="5" height="15" rx="1" />
              </svg>
              칸반
            </button>
            {canPickup && (
              <button
                onClick={() => handleViewChange('pickup')}
                title="픽업 뷰"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                  viewMode === 'pickup'
                    ? 'text-white'
                    : 'hover:bg-[var(--dt-bg)]'
                }`}
                style={
                  viewMode === 'pickup'
                    ? { backgroundColor: '#92400e', color: '#fff' }
                    : { color: 'var(--dt-text-muted)' }
                }
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                픽업
              </button>
            )}
          </div>

          <button className="dt-btn dt-btn-primary" onClick={() => navigate('/tickets/new')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            티켓 등록
          </button>
        </div>
      </div>

      {/* ── Filters (hidden in pickup view — PickupView has its own filter bar) ── */}
      {viewMode !== 'pickup' && <div className="dt-filters">
        <div className="flex items-center gap-1.5 flex-wrap">
          {typeButtons.map((btn) => (
            <button
              key={String(btn.value)}
              className={`dt-filter-btn${typeFilter === btn.value ? ' active' : ''}`}
              onClick={() => { setTypeFilter(btn.value); resetPage(); }}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {viewMode === 'list' && (
            <select
              value={String(statusFilter)}
              onChange={(e) => { setStatusFilter(e.target.value === '' ? '' : Number(e.target.value) as TicketStatus); resetPage(); }}
              className="dt-select"
            >
              {statusOptions.map((opt) => (
                <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
              ))}
            </select>
          )}

          <select
            value={productFilter}
            onChange={(e) => { setProductFilter(e.target.value); resetPage(); }}
            className="dt-select"
          >
            <option value="">전체 제품</option>
            {PRODUCT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          <select
            value={platformFilter}
            onChange={(e) => { setPlatformFilter(e.target.value); resetPage(); }}
            className="dt-select"
          >
            <option value="">전체 플랫폼</option>
            {PLATFORM_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          <label
            className="flex items-center gap-1.5 cursor-pointer text-sm select-none"
            style={{ color: 'var(--dt-text-secondary)' }}
          >
            <input
              type="checkbox"
              checked={urgentOnly}
              onChange={(e) => { setUrgentOnly(e.target.checked); resetPage(); }}
              className="rounded border-[var(--dt-border)] accent-[var(--dt-primary)]"
            />
            긴급만 보기
          </label>

          <div className="flex gap-1">
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="제목 검색..."
              className="dt-input w-44"
            />
            <button className="dt-btn dt-btn-secondary" onClick={handleSearch}>검색</button>
          </div>
        </div>
      </div>}

      {/* ── Pickup view ── */}
      {viewMode === 'pickup' && (
        <PickupView
          user={user}
          onCardClick={(id) => navigate(`/tickets/${id}`)}
        />
      )}

      {/* ── Kanban view ── */}
      {viewMode === 'kanban' && (
        <>
          {kanbanError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-600 flex items-center justify-between">
              <span>{kanbanError}</span>
              <button onClick={fetchKanban} className="ml-3 text-xs underline hover:no-underline">다시 시도</button>
            </div>
          )}
          <KanbanBoard
            tickets={kanbanTickets}
            user={user}
            loading={kanbanLoading}
            onStatusChange={handleStatusChange}
            onCardClick={(id) => navigate(`/tickets/${id}`)}
            onPickup={(id) => handlePickup({ stopPropagation: () => {} } as React.MouseEvent, id)}
            onCancelPickup={(id) => handleCancelPickup({ stopPropagation: () => {} } as React.MouseEvent, id)}
            pickingUpId={pickingUpId}
            cancellingId={cancellingId}
          />
        </>
      )}

      {/* ── List view ── */}
      {viewMode === 'list' && (
        <>
          {listError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-600 flex items-center justify-between">
              <span>{listError}</span>
              <button onClick={fetchList} className="ml-3 text-xs underline hover:no-underline">다시 시도</button>
            </div>
          )}
          <div className="dt-card overflow-hidden">
            {listLoading ? (
              <div
                className="flex items-center justify-center py-16 gap-2 text-sm"
                style={{ color: 'var(--dt-text-muted)' }}
              >
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                불러오는 중...
              </div>
            ) : listTickets.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-16 gap-3 text-sm"
                style={{ color: 'var(--dt-text-muted)' }}
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                티켓이 없습니다.
              </div>
            ) : (
              <table className="dt-table">
                <colgroup>
                  <col style={{ width: '100px' }} />  {/* 티켓번호 */}
                  <col />                              {/* 제목 */}
                  <col style={{ width: '80px' }} />   {/* 플랫폼 */}
                  <col style={{ width: '80px' }} />   {/* 제품 */}
                  <col style={{ width: '90px' }} />   {/* 타입 */}
                  <col style={{ width: '96px' }} />   {/* 상태 */}
                  <col style={{ width: '100px' }} />  {/* 요청자 */}
                  <col style={{ width: '90px' }} />   {/* 담당자 */}
                  <col style={{ width: '90px' }} />   {/* 등록일 */}
                  {canPickup && <col style={{ width: '72px' }} />}  {/* 픽업 */}
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
                    <th className="dt-col-center">담당자</th>
                    <th className="dt-col-center">등록일</th>
                    {canPickup && <th className="dt-col-center">픽업</th>}
                  </tr>
                </thead>
                <tbody>
                  {listTickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="cursor-pointer transition-colors"
                      style={{}}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--dt-bg)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                      onClick={() => navigate(`/tickets/${ticket.id}`)}
                    >
                      <td>
                        <span
                          className="font-mono text-xs"
                          style={{ color: 'var(--dt-text-muted)' }}
                        >
                          {ticket.ticketNo}
                        </span>
                      </td>
                      <td className="dt-col-title">
                        {/* ── 1행: 뱃지 + 제목 ── */}
                        <div className="flex items-center gap-1.5 min-w-0">
                          {ticket.isUrgent && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0"
                              style={{
                                background: 'var(--dt-tone-urgent-bg)',
                                color: 'var(--dt-tone-urgent)',
                                border: '1px solid var(--dt-tone-urgent-border)',
                              }}
                            >
                              긴급
                            </span>
                          )}
                          {ticket.difficulty != null && (() => {
                            const DIFF: Record<number, { label: string; bg: string; color: string; border: string }> = {
                              3: { label: '상', bg: '#f5f5f4', color: '#44403c', border: '#d6d3d1' },
                              2: { label: '중', bg: '#fafaf9', color: '#78716c', border: '#e7e5e4' },
                              1: { label: '하', bg: '#fafaf9', color: '#a8a29e', border: '#f0ece8' },
                            };
                            const d = DIFF[ticket.difficulty!];
                            return d ? (
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0"
                                style={{
                                  background: d.bg,
                                  color: d.color,
                                  border: `1px solid ${d.border}`,
                                  letterSpacing: '.02em',
                                }}
                              >
                                {d.label}
                              </span>
                            ) : null;
                          })()}
                          <span
                            className="font-medium truncate"
                            style={{ color: 'var(--dt-text-primary)' }}
                          >
                            {ticket.title}
                          </span>
                        </div>
                        {/* ── 2행: 메타 정보 라인 ── */}
                        {(() => {
                          const DIFF_LABEL: Record<number, string> = { 1: '하', 2: '중', 3: '상' };
                          const TYPE_LABEL: Record<number, string> = {
                            1: 'QA 오류', 2: '장애/오류', 3: '신규개발/개선', 4: '고객요청', 5: '유지보수',
                          };
                          const parts: string[] = [];
                          if (ticket.difficulty != null)   parts.push(DIFF_LABEL[ticket.difficulty] ?? '');
                          if (ticket.expectedEffort != null) {
                            const unit = ticket.effortUnit === 'MD' ? 'MD' : 'h';
                            parts.push(`${ticket.expectedEffort}${unit}`);
                          }
                          parts.push(TYPE_LABEL[ticket.ticketType]);
                          if (ticket.productName) parts.push(ticket.productName);
                          const filtered = parts.filter(Boolean);
                          if (filtered.length === 0) return null;
                          return (
                            <div
                              className="flex items-center gap-1 mt-0.5 flex-wrap"
                              style={{ color: 'var(--dt-text-muted)', fontSize: 10.5, lineHeight: 1.4 }}
                            >
                              {filtered.map((p, i) => (
                                <span key={i} className="flex items-center gap-1">
                                  {i > 0 && <span style={{ opacity: .4 }}>·</span>}
                                  {p}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="dt-col-center">
                        {ticket.platform ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded text-[11px] font-medium"
                            style={{
                              background: '#f5f5f4',
                              color: '#78716c',
                              border: '1px solid #e7e5e4',
                            }}
                          >
                            {ticket.platform}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--dt-border)' }} className="text-xs">-</span>
                        )}
                      </td>
                      <td className="dt-col-center">
                        <span
                          className="text-xs font-medium"
                          style={{ color: 'var(--dt-text-secondary)' }}
                        >
                          {ticket.productName ?? '-'}
                        </span>
                      </td>
                      <td className="dt-col-center"><TypeBadge type={ticket.ticketType} showLabel /></td>
                      <td className="dt-col-center"><StatusBadge status={ticket.status} /></td>
                      <td
                        className="dt-col-center text-sm"
                        style={{ color: 'var(--dt-text-secondary)' }}
                      >
                        {ticket.requesterName}
                      </td>
                      <td
                        className="dt-col-center text-sm"
                        style={{ color: 'var(--dt-text-secondary)' }}
                      >
                        {ticket.assigneeName ?? '-'}
                      </td>
                      <td
                        className="dt-col-center text-sm"
                        style={{ color: 'var(--dt-text-muted)' }}
                      >
                        {formatDate(ticket.createdAt)}
                      </td>
                      {canPickup && (
                        <td className="dt-col-center" onClick={(e) => e.stopPropagation()}>
                          {ticket.status === 3 ? (
                            <button
                              className="dt-btn dt-btn-primary text-xs px-2.5 py-1"
                              disabled={pickingUpId === ticket.id}
                              onClick={(e) => handlePickup(e, ticket.id)}
                            >
                              {pickingUpId === ticket.id ? '...' : '픽업'}
                            </button>
                          ) : ticket.status === 4 && (isMine(ticket) || user?.role === 'ADMIN') ? (
                            <button
                              className="dt-btn dt-btn-secondary text-xs px-2.5 py-1"
                              style={{
                                color: 'var(--dt-tone-urgent)',
                                borderColor: 'var(--dt-tone-urgent-bg)',
                              }}
                              disabled={cancellingId === ticket.id}
                              onClick={(e) => handleCancelPickup(e, ticket.id)}
                            >
                              {cancellingId === ticket.id ? '...' : '취소'}
                            </button>
                          ) : (
                            <span style={{ color: 'var(--dt-border)' }} className="text-xs">-</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {totalPages > 1 && (
            <div className="dt-pagination">
              <button className="dt-btn dt-btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>이전</button>
              <span className="text-sm" style={{ color: 'var(--dt-text-secondary)' }}>{page + 1} / {totalPages}</span>
              <button className="dt-btn dt-btn-secondary" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>다음</button>
            </div>
          )}
        </>
      )}

    </div>
  );
};

export default TicketBoardPage;

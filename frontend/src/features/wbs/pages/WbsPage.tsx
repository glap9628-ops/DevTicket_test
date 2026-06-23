import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getTickets, adminPatchReview } from '@/features/ticket/api';
import type { TicketSummary, TicketType } from '@/types/ticket';
// TicketType은 typeFilter 상태에 사용됨
import GanttChart from '@/features/wbs/components/GanttChart';
import CalendarView from '@/features/wbs/components/CalendarView';
import WorkStatusView from '@/features/wbs/components/WorkStatusView';

type ViewMode = 'gantt' | 'status' | 'calendar';

// ── 색상 매핑 ─────────────────────────────────────────────────────────────────
// 프로젝트 필터 점은 중립 단색 사용 (간트 바의 상태 색상 체계와 혼재 방지)
const PROJECT_DOT_COLOR = '#c4bfb9';

// 단순화 상태 색상
const SIMPLE_STATUS_META = {
  todo:     { label: '진행예정', color: '#64748b', dot: '#94a3b8' },
  progress: { label: '진행중',   color: '#1d4ed8', dot: '#2563eb' },
  done:     { label: '완료',     color: '#15803d', dot: '#16a34a' },
  delayed:  { label: '지연',     color: '#dc2626', dot: '#dc2626' },
};

const AVATAR_COLORS = ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];
const avatarColor = (name: string) =>
  AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];

function parseDate(s: string): Date {
  const d = new Date(s); d.setHours(0, 0, 0, 0); return d;
}

// ── 사이드바 섹션 컴포넌트 ────────────────────────────────────────────────────
interface SidebarItem { id: string; label: string; count: number; color: string; isAvatar?: boolean }

const SidebarSection = ({
  title, items, selected, onSelect,
}: {
  title: string;
  items: SidebarItem[];
  selected: string;
  onSelect: (id: string) => void;
}) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={{ marginBottom: 2 }}>
      {/* 섹션 헤더 */}
      <button
        onClick={() => setExpanded(p => !p)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px 6px', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: '#a8a29e' }}>
          {title}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c4c0bb" strokeWidth="2.5"
          style={{ transform: expanded ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }}>
          <polyline points="19 9 12 16 5 9"/>
        </svg>
      </button>

      {/* 섹션 항목 */}
      {expanded && items.map(item => (
        <div
          key={item.id}
          onClick={() => onSelect(item.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '4px 8px 4px 10px',
            cursor: 'pointer', borderRadius: 5, margin: '0 4px 1px',
            background: selected === item.id ? '#ddd8d2' : 'transparent',
            transition: 'background .1s',
          }}
          onMouseEnter={e => {
            if (selected !== item.id)
              (e.currentTarget as HTMLElement).style.background = '#e8e4df';
          }}
          onMouseLeave={e => {
            if (selected !== item.id)
              (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
        >
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
          <span style={{
            fontSize: 12, color: '#44403c', flex: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
const WbsPage = () => {
  const navigate = useNavigate();
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  // 뷰 모드 — URL ?tab= 파라미터로 제어
  const { search } = useLocation();
  const viewMode: ViewMode = ((new URLSearchParams(search).get('tab')) as ViewMode) || 'status';

  // 데이터
  const [tickets,  setTickets]  = useState<TicketSummary[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // 사이드바 필터 (클릭 선택)
  const [selProduct,  setSelProduct]  = useState('');
  const [selAssignee, setSelAssignee] = useState('');
  const [selPlatform, setSelPlatform] = useState('');

  // 상단 필터 바
  const [typeFilter,    setTypeFilter]   = useState<TicketType | ''>('');
  const [urgentOnly,    setUrgentOnly]   = useState(false);
  const [delayedOnly,   setDelayedOnly]  = useState(false);
  const [simpleStatus,  setSimpleStatus] = useState<'all' | 'todo' | 'progress' | 'done'>('all');

  // 줌 레벨 (GanttChart에 전달)
  const [dayW, setDayW] = useState(24);

  // ── 데이터 패치 ──────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await getTickets({ page: 0, size: 500 });
      setTickets(res.content.filter(t => t.status >= 1 && t.status <= 7));
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── 사이드바 항목 계산 ────────────────────────────────────────────────────────
  const sidebarProducts = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    tickets.forEach(t => {
      const raw = t.productName ?? '기타';
      const key = raw.toLowerCase();
      const existing = map.get(key);
      map.set(key, existing
        ? { label: existing.label, count: existing.count + 1 }
        : { label: raw, count: 1 });
    });
    return Array.from(map.entries())
      .map(([key, { label, count }]) => ({ id: key, label, count, color: PROJECT_DOT_COLOR }))
      .sort((a, b) => b.count - a.count);
  }, [tickets]);

  const sidebarAssignees = useMemo(() => {
    const map = new Map<string, number>();
    tickets.filter(t => t.assigneeName).forEach(t => {
      map.set(t.assigneeName!, (map.get(t.assigneeName!) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([k, v]) => ({ id: k, label: k, count: v, color: PROJECT_DOT_COLOR }))
      .sort((a, b) => b.count - a.count);
  }, [tickets]);

  // ── 필터 적용 ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => tickets.filter(t => {
    if (selProduct  && (t.productName ?? '기타').toLowerCase() !== selProduct) return false;
    if (selAssignee && t.assigneeName !== selAssignee)             return false;
    if (selPlatform && (t.platform ?? '') !== selPlatform)         return false;
    if (typeFilter  && t.ticketType !== typeFilter)                return false;
    if (urgentOnly  && (!t.isUrgent || t.status === 6))           return false;
    if (delayedOnly) {
      const effDate = t.desiredDueDate ?? t.requestedDueDate;
      if (!effDate) return false;
      if (parseDate(effDate) >= today) return false;
      if (t.status === 6) return false;
    }
    if (simpleStatus === 'todo')     return t.status !== 6 && t.status !== 4 && t.status !== 5;
    if (simpleStatus === 'progress') return t.status === 4 || t.status === 5;
    if (simpleStatus === 'done')     return t.status === 6;
    return true;
  }), [tickets, selProduct, selAssignee, selPlatform, typeFilter, urgentOnly, delayedOnly, simpleStatus, today]);

  // ── 기간 변경 핸들러 (드래그) ─────────────────────────────────────────────────
  const handleEndDateChange = useCallback(async (ticketId: number, newEndDate: string) => {
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, desiredDueDate: newEndDate } : t));
    try {
      await adminPatchReview(ticketId, { desiredDueDate: newEndDate });
    } catch { fetchAll(); }
  }, [tickets, fetchAll]);

  // ── 통계 ──────────────────────────────────────────────────────────────────────
  const inProgress = filtered.filter(t => t.status === 4 || t.status === 5).length;
  const done       = filtered.filter(t => t.status === 6).length;
  const urgent     = filtered.filter(t => t.isUrgent && t.status !== 6).length;
  const delayed    = filtered.filter(t => {
    const effDate = t.desiredDueDate ?? t.requestedDueDate;
    return effDate && parseDate(effDate) < today && t.status !== 6;
  }).length;

  const hasFilter = !!(selProduct || selAssignee || selPlatform || typeFilter || urgentOnly || delayedOnly || simpleStatus !== 'all');

  const resetFilters = () => {
    setSelProduct(''); setSelAssignee(''); setSelPlatform('');
    setTypeFilter(''); setUrgentOnly(false); setDelayedOnly(false);
    setSimpleStatus('all');
  };

  // ── 줌 레이블 ─────────────────────────────────────────────────────────────────
  // dayW = 하루 칸 너비(px). 숫자가 클수록 확대(일별 상세), 작을수록 축소(전체 조망)
  // 화면 약 1200px 기준 노출 일수: 32→37일 / 24→50일 / 16→75일 / 10→120일
  const ZOOM_OPTS: [string, number][] = [['1개월', 32], ['2개월', 24], ['3개월', 16], ['4개월+', 10]];

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ════════════════════════════════════════════════════════════════
          사이드바 (180px)
      ════════════════════════════════════════════════════════════════ */}
      <div style={{
        width: 180, flexShrink: 0,
        borderRight: '1px solid var(--dt-border)',
        background: '#fafaf9',
        overflow: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* 사이드바 헤더 */}
        <div style={{ padding: '12px 12px 10px', borderBottom: '1px solid var(--dt-border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#292524' }}>필터</div>
        </div>

        <SidebarSection
          title="프로젝트"
          items={sidebarProducts}
          selected={selProduct}
          onSelect={v => setSelProduct(p => p === v ? '' : v)}
        />
        <div style={{ height: 1, background: '#f0ece8', margin: '2px 8px' }} />

        <div style={{ height: 1, background: '#f0ece8', margin: '2px 8px' }} />

        <SidebarSection
          title="플랫폼"
          items={[
            { id: 'MANAGER', label: 'MANAGER', count: tickets.filter(t => (t.platform ?? 'MANAGER') === 'MANAGER').length, color: PROJECT_DOT_COLOR },
            { id: 'AGENT',   label: 'AGENT',   count: tickets.filter(t => t.platform === 'AGENT').length,   color: PROJECT_DOT_COLOR },
          ].filter(p => p.count > 0)}
          selected={selPlatform}
          onSelect={v => setSelPlatform(p => p === v ? '' : v)}
        />

        <div style={{ height: 1, background: '#f0ece8', margin: '2px 8px' }} />

        <SidebarSection
          title="담당자"
          items={sidebarAssignees}
          selected={selAssignee}
          onSelect={v => setSelAssignee(p => p === v ? '' : v)}
        />

        {/* 사이드바 필터 초기화 */}
        {hasFilter && (
          <button
            onClick={resetFilters}
            style={{
              margin: '8px 8px 4px', padding: '5px 0', borderRadius: 6, fontSize: 11,
              border: '1px solid var(--dt-border)', background: '#fff', color: '#a8a29e',
              cursor: 'pointer', fontWeight: 500,
            }}
          >
            필터 초기화
          </button>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          메인 영역
      ════════════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* ── 페이지 헤더 ── */}
        <div style={{
          padding: '10px 18px', borderBottom: '1px solid var(--dt-border)',
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#fff', flexShrink: 0,
        }}>
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', margin: 0 }}>
              {viewMode === 'gantt' ? 'Timeline' : viewMode === 'calendar' ? 'Calendar' : 'Reports'}
            </h1>
          </div>

          {/* 범례 — Calendar 탭 제외 */}
          {viewMode !== 'calendar' && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {(Object.entries(SIMPLE_STATUS_META) as [string, { label: string; dot: string }][])
                .filter(([k]) => k !== 'delayed')
                .map(([k, m]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#78716c' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: m.dot }} />
                    {m.label}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* ── 필터 바 ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 18px', borderBottom: '1px solid var(--dt-border)',
          background: '#fff', flexShrink: 0, flexWrap: 'wrap',
        }}>
          {/* 진행 상태 버튼 그룹 — Timeline / Calendar 전용 */}
          {viewMode !== 'status' && (
            <>
              <div style={{ display: 'flex', borderRadius: 6, border: '1px solid #E5E7EB', overflow: 'hidden', flexShrink: 0 }}>
                {([
                  { key: 'all',      label: '전체'    },
                  { key: 'todo',     label: '진행예정' },
                  { key: 'progress', label: '진행중'  },
                  { key: 'done',     label: '완료'    },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setSimpleStatus(key)}
                    style={{
                      height: 28, padding: '0 10px', fontSize: 12, cursor: 'pointer',
                      border: 'none', borderRight: key !== 'done' ? '1px solid #E5E7EB' : 'none',
                      fontWeight: simpleStatus === key ? 700 : 400,
                      background: simpleStatus === key ? '#F5F5F5' : '#fff',
                      color:      simpleStatus === key ? '#111827' : '#6B7280',
                      transition: 'background .1s',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* 구분선 */}
              <div style={{ width: 1, height: 20, background: 'var(--dt-border)', flexShrink: 0 }} />
            </>
          )}

          {/* 티켓 유형 */}
          <select
            className="dt-select"
            value={String(typeFilter)}
            onChange={e => setTypeFilter(e.target.value === '' ? '' : Number(e.target.value) as TicketType)}
          >
            <option value="">전체 유형</option>
            <option value="1">QA 오류</option>
            <option value="2">장애/오류</option>
            <option value="3">신규개발/개선</option>
            <option value="4">고객요청</option>
          </select>

          {/* 긴급만 */}
          <button
            onClick={() => setUrgentOnly(!urgentOnly)}
            style={{
              height: 28, padding: '0 10px', borderRadius: 6, fontSize: 12,
              fontWeight: urgentOnly ? 600 : 400, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              border:      `1px solid ${urgentOnly ? '#ef4444' : '#E5E7EB'}`,
              background:  urgentOnly ? '#fee2e2' : '#fff',
              color:       urgentOnly ? '#b91c1c' : '#6B7280',
            }}
          >
            긴급만
            {urgent > 0 && (
              <span style={{
                minWidth: 16, height: 16, borderRadius: 8, fontSize: 10, fontWeight: 700,
                background: urgentOnly ? '#b91c1c' : '#ef4444', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
              }}>
                {urgent}
              </span>
            )}
          </button>

          {/* 지연만 */}
          <button
            onClick={() => setDelayedOnly(!delayedOnly)}
            style={{
              height: 28, padding: '0 10px', borderRadius: 6, fontSize: 12,
              fontWeight: delayedOnly ? 600 : 400, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              border:      `1px solid ${delayedOnly ? '#c2410c' : '#E5E7EB'}`,
              background:  delayedOnly ? '#fff7ed' : '#fff',
              color:       delayedOnly ? '#c2410c' : '#6B7280',
            }}
          >
            지연만
            {delayed > 0 && (
              <span style={{
                minWidth: 16, height: 16, borderRadius: 8, fontSize: 10, fontWeight: 700,
                background: delayedOnly ? '#c2410c' : '#f97316', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
              }}>
                {delayed}
              </span>
            )}
          </button>

          {/* 필터 초기화 */}
          {hasFilter && (
            <button
              onClick={resetFilters}
              style={{
                height: 26, padding: '0 8px', borderRadius: 6, fontSize: 11,
                border: '1px solid var(--dt-border)', background: '#fafaf9',
                color: '#a8a29e', cursor: 'pointer',
              }}
            >
              초기화
            </button>
          )}

          {/* 줌 컨트롤 — 간트차트에서만 */}
          {viewMode === 'gantt' && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
              {ZOOM_OPTS.map(([l, w]) => (
                <button
                  key={w}
                  onClick={() => setDayW(w)}
                  style={{
                    height: 26, padding: '0 9px', borderRadius: 6, fontSize: 11,
                    fontWeight: dayW === w ? 700 : 400, cursor: 'pointer',
                    border:     `1px solid ${dayW === w ? 'var(--dt-primary-dark)' : 'var(--dt-border)'}`,
                    background: dayW === w ? 'var(--dt-primary-dark)' : '#fafaf9',
                    color:      dayW === w ? '#fff' : '#78716c',
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── 에러 ── */}
        {error && (
          <div style={{
            margin: '8px 18px', padding: '8px 12px', borderRadius: 8,
            background: '#fee2e2', border: '1px solid #fca5a5',
            fontSize: 12, color: '#b91c1c', flexShrink: 0,
          }}>
            {error}
            <button
              onClick={fetchAll}
              style={{ marginLeft: 8, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 12 }}
            >
              재시도
            </button>
          </div>
        )}

        {/* ── 컨텐츠 ── */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {loading ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--dt-text-muted)', fontSize: 13 }}>
              <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              불러오는 중...
            </div>
          ) : viewMode === 'status' ? (
            <WorkStatusView
              tickets={filtered}
              onTicketClick={id => navigate(`/tickets/${id}`)}
            />
          ) : viewMode === 'gantt' ? (
            <GanttChart
              tickets={filtered}
              onTicketClick={id => navigate(`/tickets/${id}`)}
              onEndDateChange={handleEndDateChange}
              dayW={dayW}
            />
          ) : (
            <CalendarView
              tickets={filtered}
              onTicketClick={id => navigate(`/tickets/${id}`)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default WbsPage;

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Cell,
  Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { getDashboard } from '@/features/dashboard/api';
import { getTickets } from '@/features/ticket/api';
import Badge from '@/components/ui/Badge';
import StatusBadge from '@/components/ui/StatusBadge';
import TypeBadge from '@/components/ui/TypeBadge';
import type { Dashboard, RecentActivity, TicketSummary } from '@/types/ticket';
import { DIFFICULTY_COLOR, DIFFICULTY_LABEL } from '@/types/ticket';

// ─── 상수 ────────────────────────────────────────────────────────────────────
const POLL_INTERVAL = 10_000;

/** 상태 목록 (key = 백엔드 enum 이름, num = 숫자 코드 1~8) */
const STATUS_CONFIG = [
  { key: 'PENDING_REVIEW', num: 1, label: '검토대기', color: '#96621a' },
  { key: 'REVIEW_DONE',    num: 2, label: '검토완료', color: '#a0789c' },
  { key: 'READY',          num: 3, label: '픽업대기', color: '#e07c42' },
  { key: 'IN_PROGRESS',    num: 4, label: '진행중',   color: '#2f5fa3' },
  { key: 'QA_REVIEW',      num: 5, label: 'QA검증',   color: '#6040a8' },
  { key: 'DONE',           num: 6, label: '완료',     color: '#276f4a' },
  { key: 'ON_HOLD',        num: 7, label: '보류',     color: '#475569' },
  { key: 'REJECTED',       num: 8, label: '반려',     color: '#b52b2b' },
];

/** 숫자 코드(1~8) → config (최근 활동 표시용) */
const STATUS_BY_NUM: Record<number, { key: string; label: string; color: string }> =
  Object.fromEntries(STATUS_CONFIG.map(c => [c.num, c]));

const TYPE_CONFIG = [
  { key: 'QA',     label: 'QA 오류',     color: '#6040a8' },
  { key: 'DEVOPS', label: '장애/오류',   color: '#2f5fa3' },
  { key: 'DEV',    label: '신규개발/개선', color: '#3d7a72' },
  { key: 'VENDOR', label: '고객요청',    color: '#96621a' },
] as const;

const BAR_PROGRESS     = '#2f5fa3';
const BAR_DONE         = '#276f4a';
const BAR_PROGRESS_DIM = 'rgba(47,95,163,0.20)';
const BAR_DONE_DIM     = 'rgba(39,111,74,0.20)';

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayLabel() {
  return new Date().toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'long' });
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}
function statusDotColor(n: number): string {
  return STATUS_BY_NUM[n]?.color ?? '#6b7280';
}
function statusLabel(n: number): string {
  return STATUS_BY_NUM[n]?.label ?? '-';
}

/** 최근 활동 항목 하단 메타 배지 레이블 */
function activityTypeLabel(from: number | null | undefined, to: number): string {
  if (!from) return '티켓 등록';
  if (from === 3 && to === 4) return '픽업';
  if (from === 4 && to === 3) return '픽업 취소';
  if (to === 8) return '반려 처리';
  if (to === 6) return '완료 처리';
  return '상태 변경';
}

// ─── BarChart Tooltip ─────────────────────────────────────────────────────────
const BarTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; fill: string; name: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[128px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="mb-2 font-semibold text-gray-800">{label}</div>
      <div className="space-y-1.5">
        {payload.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.fill }} />
              {item.name}
            </span>
            <span className="font-semibold text-gray-800">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── DevTicketPanel ───────────────────────────────────────────────────────────
const DevTicketPanel = ({
  assigneeId, assigneeName, onClose, navigate,
}: {
  assigneeId: number; assigneeName: string;
  onClose: () => void; navigate: (p: string) => void;
}) => {
  const [tickets, setTickets]     = useState<TicketSummary[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<'all'|'progress'|'done'>('all');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getTickets({ assigneeId, status: 4, size: 50 }),
      getTickets({ assigneeId, status: 5, size: 50 }),
      getTickets({ assigneeId, status: 6, size: 50 }),
    ])
      .then(([r4, r5, r6]) => {
        setTickets(
          [...r4.content, ...r5.content, ...r6.content]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        );
      })
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, [assigneeId]);

  const filtered = useMemo(() => {
    if (filter === 'progress') return tickets.filter(t => t.status === 4 || t.status === 5);
    if (filter === 'done')     return tickets.filter(t => t.status === 6);
    return tickets;
  }, [tickets, filter]);

  const progressCnt = tickets.filter(t => t.status === 4 || t.status === 5).length;
  const doneCnt     = tickets.filter(t => t.status === 6).length;

  return (
    <div className="dt-card overflow-hidden border-l-4" style={{ borderLeftColor: BAR_PROGRESS }}>
      <div className="flex items-center justify-between gap-4 px-5 py-3.5 bg-[#f5f0e8] border-b border-[#ddd7cf]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{assigneeName}</span>
          <span className="text-xs text-gray-400">티켓 목록</span>
        </div>
        <div className="flex items-center gap-1.5">
          {(['all','progress','done'] as const).map((key) => {
            const label = key === 'all' ? `전체 ${tickets.length}` : key === 'progress' ? `진행중 ${progressCnt}` : `완료 ${doneCnt}`;
            return (
              <button key={key} onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === key ? 'bg-white shadow-sm border border-gray-200 text-gray-800' : 'text-gray-500 hover:bg-white/60'
                }`}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/board?assigneeId=${assigneeId}`)}
            className="text-xs px-3 py-1.5 rounded-lg border border-[#ddd7cf] bg-white text-gray-600 hover:bg-[#f5f0e8] transition-colors">
            티켓 보드에서 보기 →
          </button>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-[#ede8e2] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">표시할 티켓이 없습니다.</div>
        ) : (
          <table className="dt-table" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '44%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '18%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>티켓번호</th><th>제목</th>
                <th className="dt-col-center">상태</th>
                <th className="dt-col-center">난이도</th>
                <th className="dt-col-center">등록일</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ticket) => (
                <tr key={ticket.id} className="cursor-pointer transition-colors"
                  onClick={() => navigate(`/tickets/${ticket.id}`)}>
                  <td><span className="font-mono text-xs text-gray-500">{ticket.ticketNo}</span></td>
                  <td style={{ overflow: 'hidden' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      {ticket.isUrgent && (
                        <Badge tone="urgent" variant="soft" size="xs"
                          icon={<span className="h-1.5 w-1.5 rounded-full bg-current opacity-70"/>}>
                          긴급
                        </Badge>
                      )}
                      <span className="font-medium text-gray-900 truncate" title={ticket.title}>{ticket.title}</span>
                    </div>
                  </td>
                  <td className="dt-col-center"><StatusBadge status={ticket.status} variant="outline" /></td>
                  <td className="dt-col-center">
                    {ticket.difficulty ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${DIFFICULTY_COLOR[ticket.difficulty]}`}>
                        {DIFFICULTY_LABEL[ticket.difficulty]}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">-</span>
                    )}
                  </td>
                  <td className="dt-col-center text-xs text-gray-500">{formatDate(ticket.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
const DashboardPage = () => {
  const navigate = useNavigate();
  const [dashboard, setDashboard]       = useState<Dashboard | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [selectedDev, setSelectedDev]   = useState<{ id: number; name: string } | null>(null);
  const [filterOpen, setFilterOpen]     = useState(false);

  const currentDate  = new Date();
  const currentYear  = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const [year, setYear]             = useState(currentYear);
  const [month, setMonth]           = useState<number | null>(null);
  const [draftYear, setDraftYear]   = useState(currentYear);
  const [draftMonth, setDraftMonth] = useState<number | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const fetchDashboard = useCallback(() => {
    setLoading(true);
    setError('');
    const params = month ? { year, month } : undefined;
    getDashboard(params)
      .then((data) => { setDashboard(data); })
      .catch(() => setError('대시보드 데이터를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [month, year]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);
  useEffect(() => {
    const id = setInterval(() => fetchDashboard(), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchDashboard]);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const totalTickets = useMemo(() => {
    if (!dashboard) return 0;
    return STATUS_CONFIG.reduce((s, c) => s + (dashboard.statusCounts[c.key] ?? 0), 0 as number);
  }, [dashboard]);

  const developerBarData = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.developerStats.map(item => ({
      name:       item.assigneeName.length > 6 ? `${item.assigneeName.slice(0,6)}…` : item.assigneeName,
      fullName:   item.assigneeName,
      inProgress: item.inProgressCount,
      done:       item.doneCount,
      assigneeId: item.assigneeId,
    }));
  }, [dashboard]);

  const maxWorkload = useMemo(() => {
    if (!dashboard?.developerStats.length) return 1;
    return Math.max(...dashboard.developerStats.map(d => d.inProgressCount + d.doneCount), 1);
  }, [dashboard]);

  const handleBarClick = (data: { assigneeId: number; fullName: string }) => {
    setSelectedDev(selectedDev?.id === data.assigneeId ? null : { id: data.assigneeId, name: data.fullName });
  };

  const pct = (key: string) =>
    !dashboard || totalTickets === 0 ? 0 : Math.round(((dashboard.statusCounts[key] ?? 0) / totalTickets) * 100);

  if (loading) return (
    <div className="dt-page">
      <div className="dt-card p-12 text-center text-sm text-gray-400">불러오는 중...</div>
    </div>
  );
  if (!dashboard || error) return (
    <div className="dt-page">
      <div className="dt-card p-12 text-center text-sm text-gray-400">{error || '데이터가 없습니다.'}</div>
    </div>
  );

  return (
    <div className="dt-page">

        {/* ── 헤더 ── */}
        <div className="dt-page-header">
          <div>
            <h1 className="dt-page-title">대시보드</h1>
            <p className="mt-1 text-sm text-gray-400">{todayLabel()}</p>
            <p className="mt-0.5 text-xs text-gray-400">{month ? `${year}년 ${month}월 기준` : '전체 기간 기준'}</p>
          </div>
          <div className="flex items-center gap-2">
            <div ref={filterRef} className="relative">
              <button
                onClick={() => { setDraftYear(year); setDraftMonth(month); setFilterOpen(p => !p); }}
                className="dt-btn dt-btn-secondary">
                {month ? `${year}년 ${month}월` : '기간 필터'}
              </button>
              {filterOpen && (
                <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-[#ddd7cf] bg-white p-4 shadow-lg">
                  <div className="flex items-center justify-between">
                    <button className="rounded-lg p-1 text-gray-400 hover:bg-[#f5f0e8]" onClick={() => setDraftYear(p => p - 1)}>‹</button>
                    <span className="text-sm font-medium text-gray-800">{draftYear}년</span>
                    <button className="rounded-lg p-1 text-gray-400 hover:bg-[#f5f0e8] disabled:opacity-30"
                      disabled={draftYear >= currentYear} onClick={() => setDraftYear(p => p + 1)}>›</button>
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    <button
                      className={`col-span-4 rounded-lg px-2 py-1.5 text-xs font-medium ${draftMonth === null ? 'bg-[#a7743a] text-white' : 'bg-[#f5f0e8] text-gray-600'}`}
                      onClick={() => setDraftMonth(null)}>전체</button>
                    {MONTHS.map((label, idx) => {
                      const mv = idx + 1;
                      const disabled = draftYear === currentYear && mv > currentMonth;
                      return (
                        <button key={label} disabled={disabled}
                          className={`rounded-lg px-2 py-1.5 text-xs font-medium ${draftMonth === mv ? 'bg-[#a7743a] text-white' : 'bg-[#f5f0e8] text-gray-600'} disabled:cursor-not-allowed disabled:opacity-30`}
                          onClick={() => setDraftMonth(mv)}>{label}</button>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      className="flex-1 rounded-xl border border-[#ddd7cf] px-3 py-2 text-xs font-medium text-gray-500 hover:bg-[#f5f0e8]"
                      onClick={() => { setYear(currentYear); setMonth(null); setDraftYear(currentYear); setDraftMonth(null); setFilterOpen(false); }}>
                      초기화
                    </button>
                    <button
                      className="flex-1 rounded-xl bg-[#a7743a] px-3 py-2 text-xs font-medium text-white"
                      onClick={() => { setYear(draftYear); setMonth(draftMonth); setFilterOpen(false); }}>
                      적용
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── KPI 5 Cards ── */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {/* 전체 티켓 */}
          <div className="dt-card px-5 py-4 cursor-pointer hover:border-[#c9a879] hover:shadow-md transition-all"
            onClick={() => navigate('/board?view=list')}>
            <div className="flex items-center gap-1.5 mb-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span className="text-xs text-gray-500">전체 티켓</span>
            </div>
            <div className="text-4xl font-semibold tracking-tight text-gray-900 leading-none mb-2">{totalTickets.toLocaleString()}</div>
            <div className="text-[11px] text-gray-400">등록된 모든 티켓</div>
          </div>
          {/* 픽업대기 */}
          <div className="dt-card px-5 py-4 transition-all cursor-pointer hover:border-[#c9a879] hover:shadow-md"
            onClick={() => navigate('/board?view=list&status=3')}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e07c42" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><path d="M8 7V5a2 2 0 0 0-4 0v2"/></svg>
                <span className="text-xs text-gray-500">픽업대기</span>
              </div>
              <span className="text-[11px] font-medium" style={{ color: '#e07c42' }}>{pct('READY')}%</span>
            </div>
            <div className="text-4xl font-semibold tracking-tight leading-none mb-2" style={{ color: '#e07c42' }}>{(dashboard.statusCounts.READY ?? 0).toLocaleString()}</div>
            <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct('READY')}%`, backgroundColor: '#e07c42' }} />
            </div>
          </div>
          {/* 진행중 */}
          <div className="dt-card px-5 py-4 transition-all cursor-pointer hover:border-[#c9a879] hover:shadow-md"
            onClick={() => navigate('/board?view=list&status=4')}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2f5fa3" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span className="text-xs text-gray-500">진행중</span>
              </div>
              <span className="text-[11px] font-medium" style={{ color: '#2f5fa3' }}>{pct('IN_PROGRESS')}%</span>
            </div>
            <div className="text-4xl font-semibold tracking-tight leading-none mb-2" style={{ color: '#2f5fa3' }}>{(dashboard.statusCounts.IN_PROGRESS ?? 0).toLocaleString()}</div>
            <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct('IN_PROGRESS')}%`, backgroundColor: '#2f5fa3' }} />
            </div>
          </div>
          {/* 완료 */}
          <div className="dt-card px-5 py-4 transition-all cursor-pointer hover:border-[#c9a879] hover:shadow-md"
            onClick={() => navigate('/board?view=list&status=6')}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#276f4a" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <span className="text-xs text-gray-500">완료</span>
              </div>
              <span className="text-[11px] font-medium" style={{ color: '#276f4a' }}>{pct('DONE')}%</span>
            </div>
            <div className="text-4xl font-semibold tracking-tight leading-none mb-2" style={{ color: '#276f4a' }}>{(dashboard.statusCounts.DONE ?? 0).toLocaleString()}</div>
            <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct('DONE')}%`, backgroundColor: '#276f4a' }} />
            </div>
          </div>
          {/* 긴급 */}
          <div className="dt-card px-5 py-4 transition-all cursor-pointer hover:border-[#c9a879] hover:shadow-md"
            onClick={() => navigate('/board?view=list&urgent=true')}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b52b2b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5" fill="#b52b2b"/></svg>
                <span className="text-xs text-gray-500">긴급</span>
              </div>
              <span className="text-[11px] font-medium text-red-600">즉시 처리</span>
            </div>
            <div className="text-4xl font-semibold tracking-tight leading-none mb-2 text-red-700">{dashboard.urgentCount.toLocaleString()}</div>
            <div className="text-[11px] text-gray-400">긴급 표시된 티켓</div>
          </div>
        </div>

        {/* ── Mid Row: 개발자 현황(2/3) + 분포(1/3) ── */}
        <div className="grid grid-cols-3 gap-4">

          {/* 개발자 처리 현황 */}
          <div className="dt-card col-span-2 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">개발자 처리 현황</h2>
                <p className="mt-0.5 text-xs text-gray-400">
                  {selectedDev
                    ? <span>막대 재클릭 또는 <button onClick={() => setSelectedDev(null)} className="text-[#a7743a] hover:underline font-medium">초기화</button>하면 전체 표시</span>
                    : '막대 클릭 시 해당 개발자 티켓 목록 표시'}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BAR_PROGRESS }} />진행중
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BAR_DONE }} />완료
                </span>
                {selectedDev && (
                  <button onClick={() => setSelectedDev(null)}
                    className="ml-1 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#ede8e2] text-gray-600 hover:bg-[#ddd7cf] transition-colors text-xs font-medium">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    선택 해제
                  </button>
                )}
              </div>
            </div>
            {developerBarData.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400">개발자 데이터가 없습니다.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={developerBarData}
                  margin={{ top: 8, right: 8, left: 0, bottom: developerBarData.length > 5 ? 40 : 8 }}
                  style={{ cursor: 'pointer' }}>
                  <CartesianGrid stroke="#eef1f4" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fill: '#69707c' }}
                    angle={developerBarData.length > 5 ? -30 : 0}
                    textAnchor={developerBarData.length > 5 ? 'end' : 'middle'}
                    interval={0} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#69707c' }} allowDecimals={false} domain={[0, (dataMax: number) => Math.max(dataMax, 1)]} />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(167,116,58,0.05)' }} />
                  <Bar dataKey="inProgress" name="진행중" radius={[5,5,0,0]}
                    onClick={(d) => handleBarClick(d as { assigneeId: number; fullName: string })}>
                    {developerBarData.map((e) => (
                      <Cell key={`ip-${e.assigneeId}`}
                        fill={selectedDev && selectedDev.id !== e.assigneeId ? BAR_PROGRESS_DIM : BAR_PROGRESS}
                        stroke={selectedDev?.id === e.assigneeId ? BAR_PROGRESS : 'none'}
                        strokeWidth={selectedDev?.id === e.assigneeId ? 2 : 0} />
                    ))}
                  </Bar>
                  <Bar dataKey="done" name="완료" radius={[5,5,0,0]}
                    onClick={(d) => handleBarClick(d as { assigneeId: number; fullName: string })}>
                    {developerBarData.map((e) => (
                      <Cell key={`dn-${e.assigneeId}`}
                        fill={selectedDev && selectedDev.id !== e.assigneeId ? BAR_DONE_DIM : BAR_DONE}
                        stroke={selectedDev?.id === e.assigneeId ? BAR_DONE : 'none'}
                        strokeWidth={selectedDev?.id === e.assigneeId ? 2 : 0} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 우측 분포 패널 */}
          <div className="col-span-1 flex flex-col gap-4">

            {/* 상태 분포 */}
            <div className="dt-card p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">상태 분포</h2>
              {(() => {
                const data = STATUS_CONFIG
                  .map(c => ({ ...c, value: dashboard.statusCounts[c.key] ?? 0 }))
                  .filter(c => c.value > 0);
                return (
                  <div className="flex items-center gap-4">
                    <div style={{ width: 120, height: 120, flexShrink: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={data} dataKey="value" cx="50%" cy="50%"
                            innerRadius={34} outerRadius={54} paddingAngle={2} startAngle={90} endAngle={-270}>
                            {data.map((entry) => <Cell key={entry.key} fill={entry.color} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => [v + '건', '']} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      {data.map(c => (
                        <div key={c.key} className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                          <span className="text-xs text-gray-500 flex-1 truncate">{c.label}</span>
                          <span className="text-xs font-semibold text-gray-700">{c.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* 유형 분포 */}
            <div className="dt-card p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">유형 분포</h2>
              {(() => {
                const opacities = [1, 0.72, 0.5, 0.32];
                const data = TYPE_CONFIG.map((c, i) => ({
                  ...c,
                  value: dashboard.typeCounts[c.key] ?? 0,
                  fill: `rgba(167,116,58,${opacities[i]})`,
                })).filter(c => c.value > 0);
                return (
                  <div className="flex items-center gap-4">
                    <div style={{ width: 120, height: 120, flexShrink: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={data} dataKey="value" cx="50%" cy="50%"
                            innerRadius={34} outerRadius={54} paddingAngle={2} startAngle={90} endAngle={-270}>
                            {data.map((entry) => <Cell key={entry.key} fill={entry.fill} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => [v + '건', '']} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      {data.map((c) => (
                        <div key={c.key} className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.fill }} />
                          <span className="text-xs text-gray-500 flex-1 truncate">{c.label}</span>
                          <span className="text-xs font-semibold text-gray-700">{c.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

          </div>
        </div>

        {/* ── DevTicketPanel ── */}
        {selectedDev && (
          <DevTicketPanel
            assigneeId={selectedDev.id}
            assigneeName={selectedDev.name}
            onClose={() => setSelectedDev(null)}
            navigate={navigate}
          />
        )}

        {/* ── 하단 3열 ── */}
        <div className="grid grid-cols-3 gap-4">

          {/* 지연 티켓 */}
          <div className="dt-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">지연 티켓</h2>
                <p className="mt-0.5 text-xs text-gray-400">오래 대기 중인 티켓</p>
              </div>
              {dashboard.delayedTickets.length > 0 && (
                <Badge tone="urgent" variant="soft" size="xs"
                  icon={<span className="h-1.5 w-1.5 rounded-full bg-current opacity-70"/>}>
                  {dashboard.delayedTickets.length}건
                </Badge>
              )}
            </div>
            {dashboard.delayedTickets.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">지연 티켓이 없습니다.</div>
            ) : (
              <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#f5f0e8]">
                      <th className="px-4 py-2.5 text-left text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide">티켓</th>
                      <th className="px-4 py-2.5 text-left text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide">제목</th>
                      <th className="px-4 py-2.5 text-center text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide">유형</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {dashboard.delayedTickets.map(t => (
                      <tr key={t.id} className="cursor-pointer hover:bg-[#f5f0e8] transition-colors"
                        onClick={() => navigate(`/tickets/${t.id}`)}>
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-[11px] text-[#a7743a]">{t.ticketNo}</span>
                        </td>
                        <td className="px-4 py-2.5 max-w-0" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          <div className="flex items-center gap-1.5 min-w-0">
                            {t.isUrgent && <span className="text-[9.5px] font-bold bg-red-100 text-red-700 px-1 py-0.5 rounded flex-shrink-0">긴급</span>}
                            <span className="truncate text-gray-800 font-medium">{t.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <TypeBadge type={t.ticketType} showLabel />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 담당자 Workload */}
          <div className="dt-card p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">담당자 Workload</h2>
            <p className="text-xs text-gray-400 mb-4">담당자별 진행 중 + 완료 티켓 수</p>
            {dashboard.developerStats.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">데이터가 없습니다.</div>
            ) : (
              <div className="space-y-3">
                {dashboard.developerStats
                  .slice()
                  .sort((a, b) => (b.inProgressCount + b.doneCount) - (a.inProgressCount + a.doneCount))
                  .map((dev, idx) => {
                    const total = dev.inProgressCount + dev.doneCount;
                    const inProgressRatio = maxWorkload > 0 ? Math.round((dev.inProgressCount / maxWorkload) * 100) : 0;
                    const doneRatio = maxWorkload > 0 ? Math.round((dev.doneCount / maxWorkload) * 100) : 0;
                    const isSelected = selectedDev?.id === dev.assigneeId;
                    return (
                      <div key={dev.assigneeId}
                        onClick={() => handleBarClick({ assigneeId: dev.assigneeId, fullName: dev.assigneeName })}
                        className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all ${
                          isSelected ? 'bg-[#f1e7da] border border-[#c9a879]' : 'hover:bg-[#f5f0e8]'
                        }`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-gray-800 truncate">{dev.assigneeName}</span>
                            <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                              {dev.inProgressCount > 0 && (
                                <span className="text-[10px] font-medium" style={{ color: BAR_PROGRESS }}>진행 {dev.inProgressCount}</span>
                              )}
                              {dev.doneCount > 0 && (
                                <span className="text-[10px] font-medium" style={{ color: BAR_DONE }}>완료 {dev.doneCount}</span>
                              )}
                              <span className="text-xs font-bold text-gray-700">({total})</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-[#ede8e2] rounded-full overflow-hidden flex">
                            <div className="h-full transition-all"
                              style={{ width: `${inProgressRatio}%`, backgroundColor: BAR_PROGRESS }} />
                            <div className="h-full transition-all"
                              style={{ width: `${doneRatio}%`, backgroundColor: BAR_DONE }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* 최근 활동 */}
          <div className="dt-card p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">최근 활동</h2>
            <p className="text-xs text-gray-400 mb-4">업무 이력</p>
            {(!dashboard.recentActivities || dashboard.recentActivities.length === 0) ? (
              <div className="py-12 text-center text-sm text-gray-400">활동 내역이 없습니다.</div>
            ) : (
              <div className="relative overflow-y-auto" style={{ maxHeight: 500 }}>
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-100" />
                <div>
                  {dashboard.recentActivities.map((act: RecentActivity) => {
                    const isRejected = act.toStatus === 8;
                    const dotColor = statusDotColor(act.toStatus);
                    const typeLabel = activityTypeLabel(act.fromStatus, act.toStatus);
                    return (
                      <div key={`${act.ticketId}-${act.changedAt}`}
                        className="relative flex items-start pl-5 pr-1 py-3 cursor-pointer hover:bg-[#f5f0e8] rounded-lg transition-colors"
                        onClick={() => navigate(`/tickets/${act.ticketId}`)}>
                        <div className="absolute left-[4px] top-[17px] w-[7px] h-[7px] rounded-full border-2 border-white"
                          style={{ backgroundColor: dotColor }} />
                        <div className="flex-1 min-w-0">
                          {/* row1: 제목 */}
                          <div className="text-[12.5px] font-medium text-gray-900 truncate leading-snug">{act.title}</div>
                          {/* row2: 변경내용 (fromStatus 있을 때만) */}
                          {act.fromStatus != null && (
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                              <span className="text-gray-400" style={{ textDecoration: 'line-through', textDecorationColor: '#d1d5db' }}>
                                {statusLabel(act.fromStatus)}
                              </span>
                              <span className="text-gray-300 text-[10px]">→</span>
                              <span className="font-medium" style={{ color: isRejected ? '#c0392b' : dotColor }}>
                                {statusLabel(act.toStatus)}
                              </span>
                            </div>
                          )}
                          {/* row3: 메타정보 */}
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-400">
                            <span className={`px-1.5 py-px rounded text-[10px] border ${
                              isRejected
                                ? 'bg-red-50 text-red-500 border-red-200/60'
                                : 'bg-gray-50 text-gray-400 border-gray-200'
                            }`}>{typeLabel}</span>
                            <span className="text-gray-200">·</span>
                            <span>{act.changedByName}</span>
                            <span className="text-gray-200">·</span>
                            <span>{timeAgo(act.changedAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
    </div>
  );
};

export default DashboardPage;

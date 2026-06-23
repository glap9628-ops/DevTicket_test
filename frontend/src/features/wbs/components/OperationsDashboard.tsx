import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { TicketSummary } from '@/types/ticket';

interface Props {
  tickets: TicketSummary[];
  onTicketClick: (id: number) => void;
}

const AVATAR_COLORS = ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];
const avatarColor = (name: string) => AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];

function parseDate(s: string): Date { const d = new Date(s); d.setHours(0,0,0,0); return d; }
function daysBetween(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86_400_000); }
function fmtDate(s: string) {
  const d = parseDate(s);
  return `${d.getMonth()+1}/${d.getDate()}`;
}

const STATUS_META: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: '대기',     color: '#94a3b8', bg: '#f1f5f9' },
  3: { label: '검토완료', color: '#2563eb', bg: '#eff6ff' },
  4: { label: '진행중',   color: '#7c3aed', bg: '#f5f3ff' },
  5: { label: 'QA검증',   color: '#ea580c', bg: '#fff7ed' },
  6: { label: '완료',     color: '#16a34a', bg: '#f0fdf4' },
  7: { label: '보류',     color: '#71717a', bg: '#f4f4f5' },
};

const KPI_CARDS = (today: Date, tickets: TicketSummary[]): { label: string; value: number; color: string; bg: string; border: string; icon: ReactNode }[] => [
  {
    label: '전체 업무',
    value: tickets.length,
    color: '#1e293b', bg: '#f8fafc', border: '#e2e8f0',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><polyline points="21 6 15.5 12 13 9.5"/>
      </svg>
    ),
  },
  {
    label: '진행중',
    value: tickets.filter(t => t.status === 4).length,
    color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    ),
  },
  {
    label: 'QA 대기',
    value: tickets.filter(t => t.status === 5).length,
    color: '#ea580c', bg: '#fff7ed', border: '#fed7aa',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
  },
  {
    label: '완료',
    value: tickets.filter(t => t.status === 6).length,
    color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
  },
  {
    label: '지연',
    value: tickets.filter(t => t.desiredDueDate && parseDate(t.desiredDueDate) < today && t.status !== 6).length,
    color: '#dc2626', bg: '#fef2f2', border: '#fecaca',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
  },
  {
    label: '긴급',
    value: tickets.filter(t => t.isUrgent).length,
    color: '#d97706', bg: '#fffbeb', border: '#fde68a',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
  },
];

const OperationsDashboard = ({ tickets, onTicketClick }: Props) => {
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const kpis = useMemo(() => KPI_CARDS(today, tickets), [today, tickets]);

  // 프로젝트(제품)별 진행 현황
  const projectStats = useMemo(() => {
    const map = new Map<string, TicketSummary[]>();
    tickets.forEach(t => {
      const k = t.productName ?? '기타';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    });
    return Array.from(map.entries()).map(([name, ts]) => {
      const total    = ts.length;
      const done     = ts.filter(t => t.status === 6).length;
      const delayed  = ts.filter(t => t.desiredDueDate && parseDate(t.desiredDueDate) < today && t.status !== 6).length;
      const urgent   = ts.filter(t => t.isUrgent).length;
      const inProg   = ts.filter(t => t.status === 4 || t.status === 5).length;
      const pct      = total > 0 ? Math.round((done / total) * 100) : 0;
      return { name, total, done, delayed, urgent, inProg, pct };
    }).sort((a, b) => b.total - a.total);
  }, [tickets, today]);

  // 지연 업무 TOP (최대 8건, 지연일수 내림차순)
  const delayedTickets = useMemo(() =>
    tickets
      .filter(t => t.desiredDueDate && parseDate(t.desiredDueDate) < today && t.status !== 6)
      .map(t => ({ ...t, overdueDays: daysBetween(parseDate(t.desiredDueDate!), today) }))
      .sort((a, b) => b.overdueDays - a.overdueDays)
      .slice(0, 8),
  [tickets, today]);

  // 긴급 업무 (최대 8건)
  const urgentTickets = useMemo(() =>
    tickets.filter(t => t.isUrgent && t.status !== 6).slice(0, 8),
  [tickets]);

  // 담당자 리소스 현황
  const assigneeStats = useMemo(() => {
    const map = new Map<string, { total: number; inProg: number; urgent: number; delayed: number; id?: number }>();
    tickets.filter(t => t.assigneeName).forEach(t => {
      const k = t.assigneeName!;
      if (!map.has(k)) map.set(k, { total: 0, inProg: 0, urgent: 0, delayed: 0, id: t.assigneeId });
      const s = map.get(k)!;
      s.total++;
      if (t.status === 4 || t.status === 5) s.inProg++;
      if (t.isUrgent) s.urgent++;
      if (t.desiredDueDate && parseDate(t.desiredDueDate) < today && t.status !== 6) s.delayed++;
    });
    return Array.from(map.entries())
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.total - a.total);
  }, [tickets, today]);

  const maxAssigneeTotal = Math.max(...assigneeStats.map(a => a.total), 1);

  // 카드 스타일 헬퍼
  const card = (style?: React.CSSProperties): React.CSSProperties => ({
    background: '#fff',
    borderRadius: 14,
    border: '1px solid #f1f0ef',
    boxShadow: '0 1px 4px rgba(0,0,0,.05)',
    padding: '18px 20px',
    ...style,
  });

  return (
    <div style={{ padding: '20px 24px', overflow: 'auto', flex: 1, background: '#f8f7f5' }}>

      {/* ── KPI 카드 행 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{
            background: k.bg, border: `1px solid ${k.border}`,
            borderRadius: 12, padding: '14px 16px',
            boxShadow: '0 1px 3px rgba(0,0,0,.04)',
          }}>
            <div style={{ marginBottom: 8, color: k.color, display: 'flex' }}>{k.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 12, color: '#78716c', marginTop: 4, fontWeight: 500 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── 2열 레이아웃 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* 프로젝트 진행률 */}
        <div style={card()}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
            프로젝트별 진행 현황
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {projectStats.map(p => (
              <div key={p.name}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#292524' }}>{p.name}</span>
                    <span style={{ fontSize: 10, color: '#a8a29e' }}>{p.total}건</span>
                    {p.delayed > 0 && (
                      <span style={{ fontSize: 10, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>
                        지연 {p.delayed}
                      </span>
                    )}
                    {p.urgent > 0 && (
                      <span style={{ fontSize: 10, color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>
                        긴급 {p.urgent}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: p.pct === 100 ? '#16a34a' : '#44403c' }}>{p.pct}%</span>
                </div>
                {/* 진행률 바 */}
                <div style={{ height: 8, background: '#f1f0ef', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                  {/* 완료 구간 */}
                  <div style={{
                    width: `${(p.done / p.total) * 100}%`,
                    background: 'linear-gradient(90deg,#16a34a,#4ade80)',
                    transition: 'width .4s',
                  }} />
                  {/* 진행중 구간 */}
                  <div style={{
                    width: `${(p.inProg / p.total) * 100}%`,
                    background: 'linear-gradient(90deg,#7c3aed,#a78bfa)',
                    transition: 'width .4s',
                  }} />
                </div>
                {/* 상태 분포 미니 칩 */}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {[3,4,5,6,7].map(s => {
                    const cnt = p.total > 0 ? tickets.filter(t => (t.productName ?? '기타') === p.name && t.status === s).length : 0;
                    if (!cnt) return null;
                    const m = STATUS_META[s];
                    return (
                      <span key={s} style={{ fontSize: 10, color: m.color, background: m.bg, borderRadius: 4, padding: '1px 5px' }}>
                        {m.label} {cnt}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
            {projectStats.length === 0 && (
              <div style={{ textAlign: 'center', color: '#a8a29e', fontSize: 13, padding: '20px 0' }}>데이터 없음</div>
            )}
          </div>
        </div>

        {/* 담당자 리소스 현황 */}
        <div style={card()}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
            담당자 리소스 현황
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {assigneeStats.map((a) => (
              <div key={a.name} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 10px', borderRadius: 8,
                background: a.delayed > 0 ? '#fef2f2' : a.urgent > 0 ? '#fffbeb' : '#fafaf9',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#292524' }}>{a.name}</span>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {a.delayed > 0 && (
                        <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700, background: '#fef2f2', borderRadius: 4, padding: '1px 4px' }}>지연 {a.delayed}</span>
                      )}
                      {a.urgent > 0 && (
                        <span style={{ fontSize: 10, color: '#d97706', fontWeight: 700, background: '#fffbeb', borderRadius: 4, padding: '1px 4px' }}>긴급 {a.urgent}</span>
                      )}
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#44403c' }}>{a.total}건</span>
                    </div>
                  </div>
                  <div style={{ height: 4, background: '#f1f0ef', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      width: `${(a.total / maxAssigneeTotal) * 100}%`,
                      height: '100%',
                      background: a.delayed > 0
                        ? 'linear-gradient(90deg,#dc2626,#f87171)'
                        : `linear-gradient(90deg,${avatarColor(a.name)},${avatarColor(a.name)}aa)`,
                      borderRadius: 2,
                    }} />
                  </div>
                </div>
              </div>
            ))}
            {assigneeStats.length === 0 && (
              <div style={{ textAlign: 'center', color: '#a8a29e', fontSize: 13, padding: '20px 0' }}>데이터 없음</div>
            )}
          </div>
        </div>
      </div>

      {/* ── 2열 레이아웃: 지연 + 긴급 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* 지연 업무 TOP */}
        <div style={card()}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              지연 업무 TOP
            </span>
            <span style={{ fontSize: 11, color: '#a8a29e', fontWeight: 400 }}>{delayedTickets.length}건</span>
          </div>
          {delayedTickets.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#16a34a', fontSize: 13, padding: '24px 0' }}>
              지연 업무 없음
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {delayedTickets.map(t => {
                const sm = STATUS_META[t.status];
                return (
                  <div
                    key={t.id}
                    onClick={() => onTicketClick(t.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                      background: '#fef9f9', border: '1px solid #fee2e2',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fef2f2'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fef9f9'}
                  >
                    <div style={{
                      width: 36, height: 20, borderRadius: 4, flexShrink: 0,
                      background: '#fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800, color: '#dc2626',
                    }}>
                      +{t.overdueDays}일
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#292524', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
                        {t.isUrgent && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', marginRight: 4, flexShrink: 0 }}>긴급</span>}{t.title}
                      </div>
                      <div style={{ fontSize: 10, color: '#a8a29e', marginTop: 2 }}>
                        {t.ticketNo} · {t.assigneeName ?? '-'} · 만료 {t.desiredDueDate ? fmtDate(t.desiredDueDate) : '-'}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, color: sm.color, background: sm.bg, borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>
                      {sm.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 긴급 업무 현황 */}
        <div style={card()}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#d97706', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              긴급 업무 현황
            </span>
            <span style={{ fontSize: 11, color: '#a8a29e', fontWeight: 400 }}>{urgentTickets.length}건</span>
          </div>
          {urgentTickets.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#16a34a', fontSize: 13, padding: '24px 0' }}>
              긴급 업무 없음
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {urgentTickets.map(t => {
                const sm = STATUS_META[t.status];
                const dday = t.desiredDueDate
                  ? daysBetween(parseDate(t.desiredDueDate), today)
                  : null;
                return (
                  <div
                    key={t.id}
                    onClick={() => onTicketClick(t.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                      background: '#fffdf5', border: '1px solid #fde68a',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fffbeb'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fffdf5'}
                  >
                    <div style={{ flexShrink: 0, color: '#d97706', display: 'flex', alignItems: 'center' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#292524', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.title}
                      </div>
                      <div style={{ fontSize: 10, color: '#a8a29e', marginTop: 2 }}>
                        {t.ticketNo} · {t.assigneeName ?? '-'}
                        {t.desiredDueDate && ` · 마감 ${fmtDate(t.desiredDueDate)}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: sm.color, background: sm.bg, borderRadius: 4, padding: '2px 6px' }}>
                        {sm.label}
                      </span>
                      {dday !== null && (
                        <span style={{
                          fontSize: 9, fontWeight: 700,
                          color: dday < 0 ? '#dc2626' : dday === 0 ? '#d97706' : '#71717a',
                        }}>
                          {dday < 0 ? `D+${Math.abs(dday)}` : dday === 0 ? 'D-Day' : `D-${dday}`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OperationsDashboard;

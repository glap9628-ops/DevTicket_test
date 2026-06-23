import React, { useMemo } from 'react';
import type { TicketSummary } from '@/types/ticket';

// ── 단순화 상태 ───────────────────────────────────────────────────────────────
type SimpleStatus = 'todo' | 'progress' | 'done' | 'delayed';

function getSimpleStatus(t: TicketSummary, today: Date): SimpleStatus {
  if (t.status === 6) return 'done';
  const isDelayed = t.desiredDueDate && new Date(t.desiredDueDate).setHours(0, 0, 0, 0) < today.getTime();
  if (isDelayed) return 'delayed';
  if (t.status === 4 || t.status === 5) return 'progress';
  return 'todo';
}

const SIMPLE_STATUS_META: Record<SimpleStatus, { label: string; color: string; bg: string; dot: string }> = {
  todo:     { label: '진행예정', color: '#64748b', bg: '#f1f5f9', dot: '#94a3b8' },
  progress: { label: '진행중',   color: '#1d4ed8', bg: '#eff6ff', dot: '#2563eb' },
  done:     { label: '완료',     color: '#15803d', bg: '#f0fdf4', dot: '#16a34a' },
  delayed:  { label: '지연',     color: '#dc2626', bg: '#fef2f2', dot: '#dc2626' },
};

// ── 유틸 ──────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const avatarColor = (name: string) =>
  AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];

function parseDate(s: string): Date {
  const d = new Date(s); d.setHours(0, 0, 0, 0); return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── D-day 배지 ────────────────────────────────────────────────────────────────
function getDdayBadge(dueDate: string | undefined | null, today: Date): { text: string; style: React.CSSProperties } | null {
  if (!dueDate) return null;
  const due = parseDate(dueDate);
  const diff = daysBetween(today, due);
  let text: string;
  let style: React.CSSProperties;
  if (diff > 7) {
    text = `D-${diff}`;
    style = { background: '#f0fdf4', color: '#15803d' };
  } else if (diff >= 3) {
    text = `D-${diff}`;
    style = { background: '#fffbeb', color: '#d97706' };
  } else if (diff >= 0) {
    text = diff === 0 ? 'D-Day' : `D-${diff}`;
    style = { background: '#fef2f2', color: '#dc2626' };
  } else {
    text = `D+${Math.abs(diff)}`;
    style = { background: '#dc2626', color: '#fff' };
  }
  return { text, style };
}

// ── 담당자 통계 ───────────────────────────────────────────────────────────────
interface AssigneeStat {
  name: string;
  total: number;
  inProg: number;
  done: number;
  delayed: number;
  urgent: number;
  avatarColor: string;
}

// ── 제품 통계 ────────────────────────────────────────────────────────────────
interface ProductStat {
  name: string;
  total: number;
  done: number;
  inProg: number;
  delayed: number;
  pct: number;
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface Props {
  tickets: TicketSummary[];
  onTicketClick: (id: number) => void;
}

// ── 카드 공통 컴포넌트 ─────────────────────────────────────────────────────────
const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{
    background: '#fff', borderRadius: 12,
    border: '1px solid #ede9e4',
    boxShadow: '0 1px 3px rgba(0,0,0,.04)',
    overflow: 'hidden',
    ...style,
  }}>
    {children}
  </div>
);

const CardHeader = ({
  icon, title, countText, countStyle, titleColor,
}: {
  icon: React.ReactNode; title: string; countText?: string;
  countStyle?: React.CSSProperties; titleColor?: string;
}) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px 12px',
    borderBottom: '1px solid #f3f0ec',
  }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: titleColor ?? '#1c1917', display: 'flex', alignItems: 'center', gap: 6 }}>
      {icon}
      {title}
    </div>
    {countText && (
      <span style={{
        fontSize: 11, fontWeight: 600,
        ...countStyle,
      }}>
        {countText}
      </span>
    )}
  </div>
);

// ── 상태 필 ───────────────────────────────────────────────────────────────────
const StatusPill = ({ status }: { status: SimpleStatus }) => {
  const meta = SIMPLE_STATUS_META[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
      background: meta.bg, color: meta.color, flexShrink: 0,
    }}>
      {meta.label}
    </span>
  );
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
const WorkStatusView = ({ tickets, onTicketClick }: Props) => {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [doneCollapsed, setDoneCollapsed] = React.useState(true);

  // 진행중 업무 (status 4 or 5): 지연(D+N) 최상단 → 긴급 → D-day 오름차순
  const inProgressTickets = useMemo(() => {
    return tickets
      .filter(t => t.status === 4 || t.status === 5)
      .sort((a, b) => {
        const aDelayed = !!(a.desiredDueDate && parseDate(a.desiredDueDate) < today);
        const bDelayed = !!(b.desiredDueDate && parseDate(b.desiredDueDate) < today);
        if (aDelayed !== bDelayed) return aDelayed ? -1 : 1;
        if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
        const da = a.desiredDueDate ? parseDate(a.desiredDueDate).getTime() : Infinity;
        const db = b.desiredDueDate ? parseDate(b.desiredDueDate).getTime() : Infinity;
        return da - db;
      });
  }, [tickets, today]);

  // 진행 예정 (status 1·2·3), 긴급 우선 → 등록일 오름차순
  const unassignedTodoTickets = useMemo(() => {
    return tickets
      .filter(t => t.status === 1 || t.status === 2 || t.status === 3)
      .sort((a, b) => {
        if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [tickets]);

  // 완료 업무 (status === 6, desiredDueDate 최근 14일 내), max 8
  const thisWeekDone = useMemo(() => {
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 14);
    const done = tickets.filter(t => {
      if (t.status !== 6) return false;
      if (!t.desiredDueDate) return true;
      return parseDate(t.desiredDueDate) >= cutoff;
    });
    return done.slice(0, 8);
  }, [tickets, today]);

  // 담당자 통계
  const assigneeStats = useMemo<AssigneeStat[]>(() => {
    const map = new Map<string, AssigneeStat>();
    tickets.filter(t => !!t.assigneeName).forEach(t => {
      const name = t.assigneeName!;
      if (!map.has(name)) {
        map.set(name, { name, total: 0, inProg: 0, done: 0, delayed: 0, urgent: 0, avatarColor: avatarColor(name) });
      }
      const s = map.get(name)!;
      s.total++;
      const simple = getSimpleStatus(t, today);
      if (simple === 'progress') s.inProg++;
      if (simple === 'done') s.done++;
      if (simple === 'delayed') s.delayed++;
      if (t.isUrgent) s.urgent++;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [tickets, today]);

  // 최대 total (바 너비 기준)
  const maxTotal = useMemo(() => Math.max(...assigneeStats.map(a => a.total), 1), [assigneeStats]);

  // 제품별 통계
  const productStats = useMemo<ProductStat[]>(() => {
    const map = new Map<string, ProductStat>();
    tickets.forEach(t => {
      const name = t.productName ?? '기타';
      if (!map.has(name)) map.set(name, { name, total: 0, done: 0, inProg: 0, delayed: 0, pct: 0 });
      const s = map.get(name)!;
      s.total++;
      const simple = getSimpleStatus(t, today);
      if (simple === 'done') s.done++;
      else if (simple === 'progress') s.inProg++;
      else if (simple === 'delayed') s.delayed++;
    });
    const arr = Array.from(map.values());
    arr.forEach(s => { s.pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0; });
    return arr.sort((a, b) => b.total - a.total);
  }, [tickets, today]);

  // 일정 위험도
  const riskSummary = useMemo(() => {
    let danger = 0, warn = 0, safe = 0;
    tickets.filter(t => t.status !== 6).forEach(t => {
      if (!t.desiredDueDate) { safe++; return; }
      const due = parseDate(t.desiredDueDate);
      const diff = daysBetween(today, due);
      if (diff < 0) danger++;
      else if (diff <= 7) warn++;
      else safe++;
    });
    return { danger, warn, safe };
  }, [tickets, today]);

  const taskRowStyle = (override?: React.CSSProperties): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', borderRadius: 8,
    cursor: 'pointer', transition: 'background .1s',
    ...override,
  });

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 300px',
      gap: 16,
      padding: '18px 20px',
      minHeight: '100%',
      background: '#f5f4f2',
      boxSizing: 'border-box',
    }}>

      {/* ════════════════════════════════════════════
          왼쪽 컬럼
      ════════════════════════════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

        {/* ── 진행중 업무 ── */}
        <Card>
          <CardHeader
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            }
            title="진행중 업무"
            countText={`${inProgressTickets.length}건`}
            countStyle={{ background: '#f3f4f6', color: '#111827', padding: '2px 8px', borderRadius: 10 }}
          />
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {inProgressTickets.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#a8a29e', fontSize: 12, padding: '16px 0' }}>진행중인 업무가 없습니다.</div>
            ) : inProgressTickets.map((t, idx) => {
              const ddayBadge = getDdayBadge(t.desiredDueDate, today);
              return (
                <div
                  key={t.id}
                  onClick={() => onTicketClick(t.id)}
                  style={{ ...taskRowStyle(), borderTop: idx > 0 ? '1px solid #f5f2ef' : 'none' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#faf9f7'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#1c1917', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center' }}>
                      {t.isUrgent && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', marginRight: 4, flexShrink: 0 }}>긴급</span>}
                      {t.title}
                    </div>
                    <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                        {t.assigneeName ?? '미배정'}
                      </span>
                      {t.productName && <span style={{ fontSize: 10, color: '#a8a29e' }}>· {t.productName}</span>}
                      {t.ticketNo && <span style={{ fontSize: 10, color: '#a8a29e', fontFamily: 'monospace' }}>· {t.ticketNo}</span>}
                    </div>
                  </div>
                  {ddayBadge && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, flexShrink: 0, ...ddayBadge.style }}>
                      {ddayBadge.text}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── 진행 예정 (담당자 미배정) ── */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '1px solid #f3f0ec' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              진행 예정
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#111827', padding: '2px 8px', borderRadius: 10 }}>{unassignedTodoTickets.length}건</span>
          </div>
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {unassignedTodoTickets.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#a8a29e', fontSize: 12, padding: '16px 0' }}>미배정 대기 업무가 없습니다.</div>
            ) : unassignedTodoTickets.map((t, idx) => {
              const ddayBadge = getDdayBadge(t.desiredDueDate, today);
              return (
                <div
                  key={t.id}
                  onClick={() => onTicketClick(t.id)}
                  style={{ ...taskRowStyle(), borderTop: idx > 0 ? '1px solid #f5f2ef' : 'none' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#faf9f7'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#1c1917', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center' }}>
                      {t.isUrgent && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', marginRight: 4, flexShrink: 0 }}>긴급</span>}
                      {t.title}
                    </div>
                    <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.assigneeName ? '#374151' : '#c4b5a5' }}>
                        {t.assigneeName ?? '미배정'}
                      </span>
                      {t.productName && <span style={{ fontSize: 10, color: '#a8a29e' }}>· {t.productName}</span>}
                      {t.ticketNo && <span style={{ fontSize: 10, color: '#a8a29e', fontFamily: 'monospace' }}>· {t.ticketNo}</span>}
                    </div>
                  </div>
                  {ddayBadge ? (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, flexShrink: 0, ...ddayBadge.style }}>
                      {ddayBadge.text}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 500, color: '#a8a29e', flexShrink: 0 }}>기한없음</span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── 완료 업무 (접기/펼치기) ── */}
        <Card>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: doneCollapsed ? 'none' : '1px solid #f3f0ec', cursor: 'pointer' }}
            onClick={() => setDoneCollapsed(p => !p)}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              완료 업무
              <span style={{ fontSize: 10, color: '#a8a29e', fontWeight: 400 }}>(최근 14일)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#111827', padding: '2px 8px', borderRadius: 10 }}>{thisWeekDone.length}건</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="2.5"
                style={{ transform: doneCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>
                <polyline points="19 9 12 16 5 9"/>
              </svg>
            </div>
          </div>
          {!doneCollapsed && (
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 0 }}>
              {thisWeekDone.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#a8a29e', fontSize: 12, padding: '16px 0' }}>최근 14일 내 완료된 업무가 없습니다.</div>
              ) : thisWeekDone.map((t, idx) => (
                <div
                  key={t.id}
                  onClick={() => onTicketClick(t.id)}
                  style={{ ...taskRowStyle(), borderTop: idx > 0 ? '1px solid #f5f2ef' : 'none' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#faf9f7'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', textDecoration: 'line-through', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.title}
                    </div>
                    <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af' }}>{t.assigneeName ?? '미배정'}</span>
                      {t.productName && <span style={{ fontSize: 10, color: '#a8a29e' }}>· {t.productName}</span>}
                      {t.desiredDueDate && <span style={{ fontSize: 10, color: '#a8a29e' }}>· {fmtDate(parseDate(t.desiredDueDate))} 완료</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

      </div>

      {/* ════════════════════════════════════════════
          오른쪽 컬럼
      ════════════════════════════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── 담당자 현황 ── */}
        <Card>
          <CardHeader icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
          } title="담당자 현황" />
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {assigneeStats.map(a => {
              const donePct    = (a.done    / maxTotal) * 100;
              const inProgPct  = (a.inProg  / maxTotal) * 100;
              const delayedPct = (a.delayed / maxTotal) * 100;
              return (
                <div key={a.name} style={{
                  padding: '8px 10px', borderRadius: 8, transition: 'background .1s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1c1917' }}>{a.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1c1917' }}>{a.total}<span style={{ fontSize: 10, fontWeight: 400, color: '#a8a29e', marginLeft: 1 }}>건</span></span>
                  </div>
                  {/* 세그먼트 바 */}
                  <div style={{ height: 6, background: '#f1f0ef', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
                    {a.done    > 0 && <div style={{ height: '100%', width: `${donePct}%`,    background: '#16a34a', transition: 'width .4s' }} />}
                    {a.inProg  > 0 && <div style={{ height: '100%', width: `${inProgPct}%`,  background: '#2563eb', transition: 'width .4s' }} />}
                    {a.delayed > 0 && <div style={{ height: '100%', width: `${delayedPct}%`, background: '#dc2626', transition: 'width .4s' }} />}
                  </div>
                  {/* 범례 태그 */}
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {a.done    > 0 && <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: '#f0fdf4', color: '#15803d' }}>완료 {a.done}</span>}
                    {a.inProg  > 0 && <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: '#eff6ff', color: '#1d4ed8' }}>진행중 {a.inProg}</span>}
                    {a.delayed > 0 && <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: '#fef2f2', color: '#dc2626' }}>지연 {a.delayed}</span>}
                    {a.urgent  > 0 && <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: '#fff7ed', color: '#c2410c' }}>긴급 {a.urgent}</span>}
                  </div>
                </div>
              );
            })}
            {assigneeStats.length === 0 && (
              <div style={{ textAlign: 'center', color: '#a8a29e', fontSize: 12, padding: '16px 0' }}>담당자 정보 없음</div>
            )}
          </div>
        </Card>

        {/* ── 제품별 진행률 ── */}
        <Card>
          <CardHeader icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
          } title="제품별 진행률" />
          <div>
            {productStats.map((p, idx) => {
              const donePct = p.total > 0 ? (p.done / p.total) * 100 : 0;
              const inProgPct = p.total > 0 ? (p.inProg / p.total) * 100 : 0;
              const pctColor = p.pct >= 70 ? '#15803d' : p.delayed > 0 ? '#dc2626' : '#a8a29e';
              return (
                <div key={p.name} style={{
                  padding: '10px 16px',
                  borderTop: idx > 0 ? '1px solid #f5f2ef' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1c1917' }}>{p.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: pctColor }}>{p.pct}%</span>
                  </div>
                  <div style={{ height: 6, background: '#f1f0ef', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
                    <div style={{ height: '100%', width: `${donePct}%`, background: 'linear-gradient(90deg,#16a34a,#4ade80)', borderRadius: 3 }} />
                    <div style={{ height: '100%', width: `${inProgPct}%`, background: 'linear-gradient(90deg,#2563eb,#60a5fa)' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                    {p.inProg > 0 && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, fontWeight: 500, background: '#eff6ff', color: '#1d4ed8' }}>진행중 {p.inProg}</span>}
                    {p.done > 0 && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, fontWeight: 500, background: '#f0fdf4', color: '#15803d' }}>완료 {p.done}</span>}
                    {(p.total - p.done - p.inProg - p.delayed) > 0 && (
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, fontWeight: 500, background: '#f1f5f9', color: '#64748b' }}>
                        진행예정 {p.total - p.done - p.inProg - p.delayed}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {productStats.length === 0 && (
              <div style={{ textAlign: 'center', color: '#a8a29e', fontSize: 12, padding: '20px 0' }}>제품 정보 없음</div>
            )}
          </div>
        </Card>

        {/* ── 일정 위험도 ── */}
        <Card>
          <CardHeader icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
            </svg>
          } title="일정 위험도" />
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca',
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', display: 'flex', alignItems: 'center' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', display: 'inline-block', marginRight: 4, flexShrink: 0 }}/>위험</div>
                <div style={{ fontSize: 10, color: '#a8a29e', marginTop: 1 }}>마감 초과 업무</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626' }}>{riskSummary.danger}</div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a',
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', display: 'flex', alignItems: 'center' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706', display: 'inline-block', marginRight: 4, flexShrink: 0 }}/>주의</div>
                <div style={{ fontSize: 10, color: '#a8a29e', marginTop: 1 }}>D-7 이내 마감</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706' }}>{riskSummary.warn}</div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0',
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', display: 'flex', alignItems: 'center' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#15803d', display: 'inline-block', marginRight: 4, flexShrink: 0 }}/>정상</div>
                <div style={{ fontSize: 10, color: '#a8a29e', marginTop: 1 }}>D-7 이후 마감</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#15803d' }}>{riskSummary.safe}</div>
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
};

export default WorkStatusView;

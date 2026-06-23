import { useState, useRef, useCallback, useEffect } from 'react';
import type { TicketSummary } from '@/types/ticket';
import { TICKET_TYPE_LABEL } from '@/types/ticket';

// ─── 상수 ────────────────────────────────────────────────────────────────────
const LEFT_W   = 295;  // 좌측 WBS 패널 폭
const ROW_H    = 48;   // 티켓 행 높이
const GROUP_H  = 46;   // 그룹 행 높이
const HEADER_H = 64;   // 헤더 높이 (월 24 + 일/요일 40)
const TOTAL_DAYS = 150; // 총 표시 일수

// ─── 바 스타일: 긴급(빨강) > 지연(주황) > 진행중(파랑) > 기본(회색) ─────────
function getBarStyle(ticket: TicketSummary, isDelayed: boolean): { gradient: string; dot: string; progress: number } {
  if (ticket.status === 6) return { gradient: 'linear-gradient(90deg,#16a34a,#4ade80)', dot: '#16a34a', progress: 100 };
  const inProgress = ticket.status === 4 || ticket.status === 5;
  if (ticket.isUrgent)
    return { gradient: 'linear-gradient(90deg,#ef4444,#f87171)', dot: '#ef4444', progress: inProgress ? 50 : 10 };
  if (isDelayed)
    return { gradient: 'linear-gradient(90deg,#f97316,#fb923c)', dot: '#f97316', progress: inProgress ? 50 : 10 };
  if (inProgress) return { gradient: 'linear-gradient(90deg,#2563eb,#60a5fa)', dot: '#2563eb', progress: 50 };
  return { gradient: 'linear-gradient(90deg,#94a3b8,#cbd5e1)', dot: '#94a3b8', progress: 10 };
}

// ─── 날짜 유틸 ────────────────────────────────────────────────────────────────
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDate(s: string): Date {
  const d = new Date(s); d.setHours(0, 0, 0, 0); return d;
}
function fmtShort(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getDday(dueDate: string | undefined | null, today: Date, isDone: boolean): string | null {
  if (!dueDate || isDone) return null;
  const diff = daysBetween(today, parseDate(dueDate));
  if (diff > 0) return `D-${diff}`;
  if (diff === 0) return 'D-Day';
  return `D+${Math.abs(diff)}`;
}

// ─── 바 날짜 계산 ─────────────────────────────────────────────────────────────
function getBarDates(t: TicketSummary): { start: Date; end: Date; isEstimated: boolean } {
  const start = parseDate(t.createdAt);
  const effDueDate = t.desiredDueDate ?? t.requestedDueDate;
  if (effDueDate) {
    const end = parseDate(effDueDate);
    return { start, end: end < start ? addDays(start, 1) : end, isEstimated: false };
  }
  const days = t.difficulty === 3 ? 14 : t.difficulty === 2 ? 7 : t.difficulty === 1 ? 3 : 5;
  return { start, end: addDays(start, days), isEstimated: true };
}

// ─── 그룹화 ──────────────────────────────────────────────────────────────────
interface Group { key: string; tickets: TicketSummary[] }

function groupByProduct(tickets: TicketSummary[]): Group[] {
  const map = new Map<string, TicketSummary[]>();
  for (const t of tickets) {
    const k = t.productName ?? '기타';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(t);
  }
  return Array.from(map.entries()).map(([key, ts]) => ({
    key,
    tickets: ts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  }));
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
interface TooltipInfo {
  x: number; y: number;
  ticket: TicketSummary;
  barStart: Date; barEnd: Date; isEstimated: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  tickets: TicketSummary[];
  onTicketClick: (id: number) => void;
  onEndDateChange?: (ticketId: number, newEndDate: string) => void;
  dayW?: number; // 부모(WbsPage)에서 제어
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
const GanttChart = ({ tickets, onTicketClick, onEndDateChange, dayW = 24 }: Props) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // 타임라인 시작 = 오늘 기준 45일 전 (오늘이 약 30% 위치)
  const timelineStart = addDays(today, -45);
  const todayOffset   = daysBetween(timelineStart, today);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [tooltip,        setTooltip]        = useState<TooltipInfo | null>(null);

  const dragRef = useRef<{
    ticketId: number; type: 'move' | 'resize';
    startX: number; origStart: Date; origEnd: Date;
  } | null>(null);
  const [dragOverride, setDragOverride] = useState<Map<number, { start: Date; end: Date }>>(new Map());

  const scrollRef = useRef<HTMLDivElement>(null);
  const groups = groupByProduct(tickets);

  // 그룹 초기화: 새 그룹은 자동 펼침, 기존 접힌 상태는 유지
  useEffect(() => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      groups.forEach(g => { if (!next.has(g.key)) next.add(g.key); });
      return next;
    });
  }, [tickets]); // eslint-disable-line

  // 오늘로 스크롤 (dayW 변경 시도 포함)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = Math.max(0, (todayOffset - 6) * dayW);
    }
  }, [dayW, todayOffset]);

  const toggleGroup = (key: string) =>
    setExpandedGroups(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  // ── 타임라인 헤더 데이터 ───────────────────────────────────────────────────
  const days = Array.from({ length: TOTAL_DAYS }, (_, i) => addDays(timelineStart, i));
  const months: { label: string; startIdx: number; count: number }[] = [];
  let cur = { label: '', startIdx: 0, count: 0 };
  days.forEach((d, i) => {
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    if (label !== cur.label) {
      if (cur.count > 0) months.push(cur);
      cur = { label, startIdx: i, count: 1 };
    } else { cur.count++; }
  });
  if (cur.count > 0) months.push(cur);

  // ── drag handlers ──────────────────────────────────────────────────────────
  const handleBarMouseDown = useCallback((
    e: React.MouseEvent,
    ticket: TicketSummary,
    barStart: Date, barEnd: Date,
    type: 'move' | 'resize',
  ) => {
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { ticketId: ticket.id, type, startX: e.clientX, origStart: barStart, origEnd: barEnd };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const deltaDays = Math.round((e.clientX - dragRef.current.startX) / dayW);
      const { ticketId, type, origStart, origEnd } = dragRef.current;
      setDragOverride(prev => {
        const next = new Map(prev);
        if (type === 'move') {
          next.set(ticketId, { start: addDays(origStart, deltaDays), end: addDays(origEnd, deltaDays) });
        } else {
          const newEnd = addDays(origEnd, deltaDays);
          next.set(ticketId, { start: origStart, end: newEnd > origStart ? newEnd : addDays(origStart, 1) });
        }
        return next;
      });
    };
    const onUp = () => {
      if (!dragRef.current) return;
      const { ticketId } = dragRef.current;
      const override = dragOverride.get(ticketId);
      if (override && onEndDateChange) onEndDateChange(ticketId, toDateStr(override.end));
      dragRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dayW, dragOverride, onEndDateChange]);

  // ── 네비게이션 ────────────────────────────────────────────────────────────
  const scrollBy = (days: number) => {
    scrollRef.current && (scrollRef.current.scrollLeft += days * dayW);
  };
  const scrollToToday = () => {
    scrollRef.current && (scrollRef.current.scrollLeft = Math.max(0, (todayOffset - 6) * dayW));
  };

  // ── 버튼 스타일 헬퍼 ──────────────────────────────────────────────────────
  const navBtnStyle = (active?: boolean): React.CSSProperties => ({
    height: 26, padding: '0 10px', borderRadius: 6, fontSize: 11,
    fontWeight: active ? 700 : 500, cursor: 'pointer',
    border:     `1px solid ${active ? 'var(--dt-primary-dark)' : 'var(--dt-border)'}`,
    background: active ? 'var(--dt-primary-dark)' : '#fafaf9',
    color:      active ? '#fff' : '#78716c',
  });

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* ══════════════════════════════════════════════════════════════
          네비게이션 바 (이전주 / 오늘 / 다음주)
      ══════════════════════════════════════════════════════════════ */}
      <div style={{
        padding: '6px 14px', borderBottom: '1px solid var(--dt-border)',
        display: 'flex', alignItems: 'center', gap: 6,
        background: '#fff', flexShrink: 0,
      }}>
        <button style={navBtnStyle()} onClick={() => scrollBy(-7)}>◀ 이전주</button>
        <button style={navBtnStyle(true)} onClick={scrollToToday}>오늘</button>
        <button style={navBtnStyle()} onClick={() => scrollBy(7)}>다음주 ▶</button>

        <span style={{ fontSize: 11, color: '#a8a29e', marginLeft: 6 }}>
          {today.getFullYear()}년 {today.getMonth() + 1}월 기준
        </span>

      </div>

      {/* ══════════════════════════════════════════════════════════════
          간트 스크롤 영역
      ══════════════════════════════════════════════════════════════ */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflow: 'auto', position: 'relative', userSelect: 'none' }}
      >
        <div style={{ display: 'inline-flex', flexDirection: 'column', minWidth: LEFT_W + TOTAL_DAYS * dayW }}>

          {/* ── 헤더 행 ── */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 20 }}>

            {/* 헤더 좌측 */}
            <div style={{
              width: LEFT_W, flexShrink: 0,
              position: 'sticky', left: 0, zIndex: 21,
              height: HEADER_H, background: '#fafaf9',
              borderRight: '1px solid var(--dt-border)', borderBottom: '1px solid var(--dt-border)',
              display: 'flex', alignItems: 'center', padding: '0 14px', gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#c4c0bb" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                티켓 / 작업 항목
              </span>
            </div>

            {/* 타임라인 헤더 우측 */}
            <div style={{ position: 'relative', height: HEADER_H, background: '#fafaf9', borderBottom: '1px solid var(--dt-border)' }}>
              {/* 월 행 */}
              <div style={{ display: 'flex', height: 24, borderBottom: '1px solid var(--dt-border)' }}>
                {months.map(m => (
                  <div key={m.label} style={{
                    width: m.count * dayW, flexShrink: 0,
                    borderRight: '1px solid var(--dt-border)',
                    display: 'flex', alignItems: 'center', padding: '0 8px',
                    fontSize: 11, fontWeight: 700, color: '#78716c', overflow: 'hidden',
                  }}>
                    {m.label}
                  </div>
                ))}
              </div>
              {/* 일/요일 행 */}
              <div style={{ display: 'flex', height: 40 }}>
                {days.map((d, i) => {
                  const dow       = d.getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  const isToday   = i === todayOffset;
                  const DOW_KO    = ['일', '월', '화', '수', '목', '금', '토'];
                  const showLabel = dayW >= 20 || d.getDate() % 5 === 1;
                  return (
                    <div key={i} style={{
                      width: dayW, flexShrink: 0,
                      borderRight: '1px solid #f0ece8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexDirection: 'column', gap: 0,
                      background: isToday ? '#fff7ed' : isWeekend ? '#f7f5f3' : '#fafaf9',
                      color: isToday ? '#92400e' : isWeekend ? '#c7c3be' : '#a8a29e',
                    }}>
                      {showLabel && (
                        <span style={{
                          fontSize: dayW >= 20 ? 11 : 9,
                          fontWeight: isToday ? 800 : 500,
                          lineHeight: 1.2,
                        }}>
                          {d.getDate()}
                        </span>
                      )}
                      {dayW >= 16 && (
                        <span style={{
                          fontSize: dayW >= 20 ? 9 : 8,
                          fontWeight: isToday ? 700 : 400,
                          lineHeight: 1.2,
                          color: isToday ? '#ea580c' : dow === 0 ? '#ef4444' : dow === 6 ? '#3b82f6' : '#c7c3be',
                        }}>
                          {DOW_KO[dow]}
                        </span>
                      )}
                      {isToday && (
                        <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#ea580c', marginTop: 1 }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── 데이터 행 ── */}
          {groups.map(group => {
            const expanded   = expandedGroups.has(group.key);
            const groupDates = group.tickets.map(t => dragOverride.get(t.id) ?? getBarDates(t));
            const gStart     = groupDates.reduce((mn, d) => d.start < mn ? d.start : mn, groupDates[0]?.start ?? today);
            const gEnd       = groupDates.reduce((mx, d) => d.end   > mx ? d.end   : mx, groupDates[0]?.end   ?? today);
            const gLeft      = Math.max(0, daysBetween(timelineStart, gStart));
            const gLen       = Math.max(1, daysBetween(gStart, gEnd));

            // 그룹 상태별 카운트 (단순화)
            const counts = { todo: 0, progress: 0, done: 0 };
            group.tickets.forEach(t => {
              if (t.status === 6) counts.done++;
              else if (t.status === 4 || t.status === 5) counts.progress++;
              else counts.todo++;
            });
            const chips = [
              { key: 'todo',     label: '진행예정', color: '#64748b', bg: 'rgba(100,116,139,.08)', count: counts.todo     },
              { key: 'progress', label: '진행중',   color: '#1d4ed8', bg: 'rgba(29,78,216,.08)',   count: counts.progress },
              { key: 'done',     label: '완료',     color: '#15803d', bg: 'rgba(21,128,61,.08)',    count: counts.done     },
            ].filter(c => c.count > 0);

            return (
              <div key={group.key}>

                {/* ── 그룹 헤더 행 ── */}
                <div style={{ display: 'flex', minWidth: LEFT_W + TOTAL_DAYS * dayW }}>

                  {/* 좌측: 제품명 + 날짜범위 + 상태칩 */}
                  <div
                    onClick={() => toggleGroup(group.key)}
                    style={{
                      width: LEFT_W, flexShrink: 0, height: GROUP_H,
                      position: 'sticky', left: 0, zIndex: 11,
                      background: '#f8f7f5',
                      borderTop: '2px solid #e7e5e4', borderBottom: '1px solid #e7e5e4',
                      borderRight: '1px solid #e7e5e4',
                      display: 'flex', flexDirection: 'column', justifyContent: 'center',
                      padding: '0 10px 0 12px', gap: 3, cursor: 'pointer',
                    }}
                  >
                    {/* 1행: 화살표 + 제품명 + 건수 배지 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="2.5"
                        style={{ transition: 'transform .15s', transform: expanded ? 'rotate(0)' : 'rotate(-90deg)', flexShrink: 0 }}>
                        <polyline points="19 9 12 16 5 9"/>
                      </svg>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#292524', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {group.key}
                      </span>
                      <span style={{ fontSize: 10, color: '#78716c', background: '#eeebe7', borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
                        {group.tickets.length}건
                      </span>
                    </div>

                    {/* 2행: 날짜 범위 + 상태 칩 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 17 }}>
                      <span style={{ fontSize: 10, color: '#a8a29e', marginRight: 2, whiteSpace: 'nowrap' }}>
                        {fmtShort(gStart)} ~ {fmtShort(gEnd)}
                      </span>
                      {chips.map(c => (
                        <span key={c.key} style={{
                          fontSize: 10, fontWeight: 500, padding: '1px 5px', borderRadius: 3,
                          background: c.bg, color: c.color, whiteSpace: 'nowrap',
                        }}>
                          {c.label} {c.count}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* 우측: 그룹 타임라인 */}
                  <div style={{
                    position: 'relative', width: TOTAL_DAYS * dayW, height: GROUP_H,
                    background: '#f8f7f5',
                    borderTop: '2px solid #e7e5e4', borderBottom: '1px solid #e7e5e4',
                    flexShrink: 0,
                  }}>
                    {/* 주말 음영 */}
                    {days.map((d, i) => (d.getDay() === 0 || d.getDay() === 6) && (
                      <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: i * dayW, width: dayW, background: 'rgba(0,0,0,.015)', pointerEvents: 'none' }} />
                    ))}
                    {/* 그룹 스팬 underline */}
                    {groupDates.length > 0 && (
                      <div style={{
                        position: 'absolute', bottom: 10,
                        left: gLeft * dayW,
                        width: Math.max(gLen * dayW - 2, 4),
                        height: 3, borderRadius: 2,
                        background: 'rgba(0,0,0,.10)', pointerEvents: 'none',
                      }} />
                    )}
                    {/* 오늘 선 */}
                    <div style={{
                      position: 'absolute', top: 0, bottom: 0,
                      left: todayOffset * dayW + dayW / 2 - 1,
                      width: 2, background: 'rgba(234,88,12,.22)', pointerEvents: 'none', zIndex: 3,
                    }} />
                  </div>
                </div>

                {/* ── 티켓 행 ── */}
                {expanded && group.tickets.map(ticket => {
                  const ov = dragOverride.get(ticket.id);
                  const { start: barStart, end: barEnd, isEstimated } =
                    ov ? { ...ov, isEstimated: false } : getBarDates(ticket);
                  const left   = daysBetween(timelineStart, barStart);
                  const len    = Math.max(1, daysBetween(barStart, barEnd));
                  const isDone = ticket.status === 6;
                  const ticketEffDate = ticket.desiredDueDate ?? ticket.requestedDueDate;
                  const isDelayed = !isDone && !!ticketEffDate &&
                    parseDate(ticketEffDate) < today;
                  const statusMeta = getBarStyle(ticket, isDelayed);

                  return (
                    <div key={ticket.id} style={{ display: 'flex', minWidth: LEFT_W + TOTAL_DAYS * dayW }}>

                      {/* 좌측 패널 */}
                      <div
                        onClick={() => onTicketClick(ticket.id)}
                        style={{
                          width: LEFT_W, flexShrink: 0, height: ROW_H,
                          position: 'sticky', left: 0, zIndex: 10,
                          background: '#fff',
                          borderBottom: '1px solid #f0ece8',
                          borderRight:  '1px solid var(--dt-border)',
                          display: 'flex', alignItems: 'center',
                          padding: '0 8px 0 22px', gap: 6, cursor: 'pointer',
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fafaf9'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}
                      >
                        {/* 상태 색상 불릿 */}
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusMeta.dot, flexShrink: 0, marginTop: 1 }} />

                        {/* 2줄 메타 정보 */}
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {/* 1줄: 제목 */}
                          <div style={{
                            fontSize: 12, fontWeight: 600, color: '#1c1917',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {ticket.title}
                          </div>
                          {/* 2줄: 담당자 · 기간 · 긴급/지연 인디케이터 */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                            {ticket.assigneeName && (
                              <span style={{ fontSize: 10, color: '#78716c', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                {ticket.assigneeName}
                              </span>
                            )}
                            {ticket.assigneeName && (
                              <span style={{ fontSize: 10, color: '#c4bfb9' }}>·</span>
                            )}
                            <span style={{ fontSize: 10, color: '#a8a29e', whiteSpace: 'nowrap' }}>
                              {fmtShort(barStart)} ~ {fmtShort(barEnd)}
                            </span>
                          </div>
                        </div>

                        {/* 티켓 번호 배지 */}
                        <span style={{
                          fontSize: 10, fontFamily: 'monospace',
                          color: '#78716c', background: '#f5f3ef',
                          border: '1px solid #e7e5e4',
                          borderRadius: 4, padding: '1px 5px',
                          flexShrink: 0, whiteSpace: 'nowrap',
                        }}>
                          {ticket.ticketNo}
                        </span>
                      </div>

                      {/* 우측 타임라인 */}
                      <div style={{
                        position: 'relative', width: TOTAL_DAYS * dayW, height: ROW_H,
                        borderBottom: '1px solid #f0ece8', flexShrink: 0,
                      }}>
                        {/* 주말 음영 */}
                        {days.map((d, i) => (d.getDay() === 0 || d.getDay() === 6) && (
                          <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: i * dayW, width: dayW, background: 'rgba(0,0,0,.015)', pointerEvents: 'none' }} />
                        ))}

                        {/* 오늘 선 */}
                        <div style={{
                          position: 'absolute', top: 0, bottom: 0,
                          left: todayOffset * dayW + dayW / 2 - 1,
                          width: 2, background: 'rgba(234,88,12,.18)', pointerEvents: 'none', zIndex: 3,
                        }} />

                        {/* 지연 오버레이 (오늘 이전 영역 살짝 붉게) */}
                        {isDelayed && left + len > 0 && left < TOTAL_DAYS && (
                          <div style={{
                            position: 'absolute', top: 0, bottom: 0,
                            left: Math.max(0, left) * dayW,
                            width: Math.min(todayOffset - Math.max(0, left), len) * dayW,
                            background: 'rgba(185,28,28,.03)', pointerEvents: 'none',
                          }} />
                        )}

                        {/* 간트 바 */}
                        {left < TOTAL_DAYS && left + len > 0 && (() => {
                          const barMeta = statusMeta;
                          const progress = barMeta.progress;
                          const effDueDateForBar = ticket.desiredDueDate ?? ticket.requestedDueDate;
                          const dday = getDday(effDueDateForBar, today, isDone);
                          const barPx = Math.max(len * dayW - 4, 8);
                          const leftPx = Math.max(0, left) * dayW;
                          return (
                            <>
                              {/* ── Main bar ── */}
                              <div
                                onMouseDown={e => handleBarMouseDown(e, ticket, barStart, barEnd, 'move')}
                                onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, ticket, barStart, barEnd, isEstimated })}
                                onMouseLeave={() => setTooltip(null)}
                                style={{
                                  position: 'absolute',
                                  left: leftPx, width: barPx,
                                  top: 8, height: 24, borderRadius: 6,
                                  background: barMeta.gradient,
                                  opacity: ticket.status === 7 ? 0.5 : 1,
                                  cursor: 'grab',
                                  display: 'flex', alignItems: 'center',
                                  overflow: 'hidden', whiteSpace: 'nowrap',
                                  boxShadow: '0 1px 4px rgba(0,0,0,.12)',
                                  border: isEstimated ? '1.5px dashed rgba(255,255,255,.5)' : 'none',
                                  zIndex: 4,
                                  // 긴급: 좌측 4px 진한 빨강 강조선
                                  ...(ticket.isUrgent ? { boxShadow: 'inset 4px 0 0 #b91c1c, 0 1px 4px rgba(0,0,0,.12)' } : {}),
                                }}
                              >
                                {/* Progress fill overlay */}
                                {progress > 0 && progress < 100 && (
                                  <div style={{
                                    position: 'absolute', left: 0, top: 0, bottom: 0,
                                    width: `${progress}%`,
                                    background: 'rgba(255,255,255,0.2)',
                                    borderRadius: '6px 0 0 6px',
                                    pointerEvents: 'none',
                                  }} />
                                )}
                                {/* Bar content */}
                                {barPx > 45 && (
                                  <div style={{
                                    position: 'relative', zIndex: 1,
                                    display: 'flex', alignItems: 'center',
                                    width: '100%',
                                    padding: `0 7px 0 ${ticket.isUrgent ? 10 : 7}px`,
                                    gap: 4,
                                  }}>
                                    <span style={{
                                      fontSize: 10, fontWeight: 600, color: '#fff',
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                      flex: 1,
                                    }}>
                                      {barPx > 100 ? ticket.title : ticket.ticketNo}
                                    </span>
                                    {/* D+ (지연) 또는 D- 우측 표시 */}
                                    {dday && barPx > 80 && (
                                      <span style={{
                                        fontSize: 9, fontWeight: 700, flexShrink: 0,
                                        color: '#fff',
                                        background: isDelayed ? 'rgba(220,38,38,0.55)' : 'rgba(0,0,0,0.2)',
                                        borderRadius: 3, padding: '1px 4px',
                                      }}>
                                        {dday}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Done diagonal overlay */}
                              {isDone && (
                                <div style={{
                                  position: 'absolute', left: leftPx, width: barPx,
                                  top: 8, height: 24, borderRadius: 6,
                                  background: 'repeating-linear-gradient(45deg,rgba(255,255,255,.15) 0,rgba(255,255,255,.15) 3px,transparent 3px,transparent 8px)',
                                  pointerEvents: 'none', zIndex: 5,
                                }} />
                              )}

                              {/* Resize handle */}
                              <div
                                onMouseDown={e => handleBarMouseDown(e, ticket, barStart, barEnd, 'resize')}
                                style={{
                                  position: 'absolute',
                                  left: leftPx + barPx - 6,
                                  top: 8, width: 8, height: 24,
                                  cursor: 'ew-resize', zIndex: 7,
                                  borderRadius: '0 6px 6px 0',
                                  background: 'rgba(255,255,255,0.25)',
                                }}
                              />
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* 빈 상태 */}
          {groups.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#a8a29e', fontSize: 13 }}>
              표시할 티켓이 없습니다.
            </div>
          )}
        </div>
      </div>

      {/* ── 툴팁 ── */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 10,
          background: '#1c1917', color: '#fff', borderRadius: 8,
          padding: '8px 12px', fontSize: 12, zIndex: 1000,
          pointerEvents: 'none', minWidth: 190,
          boxShadow: '0 4px 12px rgba(0,0,0,.3)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
            {tooltip.ticket.ticketNo}
            {tooltip.ticket.isUrgent && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: '#fef2f2', color: '#dc2626' }}>긴급</span>}
          </div>
          <div style={{ color: '#d4cfc9', marginBottom: 5, fontSize: 11, lineHeight: 1.5 }}>
            {tooltip.ticket.title}
          </div>
          <div style={{ color: '#a8a29e', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span>기간 {fmtShort(tooltip.barStart)} → {fmtShort(tooltip.barEnd)} ({daysBetween(tooltip.barStart, tooltip.barEnd)}일)</span>
            {tooltip.isEstimated && (
              <span style={{ color: '#fcd34d' }}>기간 미설정 (예상치)</span>
            )}
            {tooltip.ticket.assigneeName && (
              <span>담당 {tooltip.ticket.assigneeName}</span>
            )}
            <span>유형 {TICKET_TYPE_LABEL[tooltip.ticket.ticketType]} · {
              tooltip.ticket.status === 6 ? '완료'
              : (() => { const ed = tooltip.ticket.desiredDueDate ?? tooltip.ticket.requestedDueDate; return ed && new Date(ed) < today; })() ? '지연'
              : (tooltip.ticket.status === 4 || tooltip.ticket.status === 5) ? '진행중' : '진행예정'
            }</span>
            {tooltip.ticket.difficulty && (
              <span>난이도 {['','하','중','상'][tooltip.ticket.difficulty]}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GanttChart;

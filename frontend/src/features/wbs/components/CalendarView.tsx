import { useState, useMemo, useEffect } from 'react';
import type { TicketSummary } from '@/types/ticket';
import { TICKET_STATUS_LABEL } from '@/types/ticket';

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function parseDate(s: string): Date { const d = new Date(s); d.setHours(0,0,0,0); return d; }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function sameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function daysInMonth(y: number, m: number) { return new Date(y, m+1, 0).getDate(); }
function startOfWeek(d: Date): Date { const r = new Date(d); r.setDate(r.getDate()-r.getDay()); r.setHours(0,0,0,0); return r; }
function fmtDate(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

// ── 뷰 모드 ───────────────────────────────────────────────────────────────────
type PeriodMode = '일간' | '주간' | '월간' | '목록';
const PERIOD_MODES: PeriodMode[] = ['일간', '주간', '월간', '목록'];

// ── 시각 우선순위 ─────────────────────────────────────────────────────────────
type VisualTier = 'delayed' | 'urgent' | 'active' | 'planned' | 'done';

function getVisualTier(t: TicketSummary, today: Date): VisualTier {
  const s = t.status as number;
  if (s === 6) return 'done';
  const effDueDate = t.desiredDueDate ?? t.requestedDueDate;
  if (effDueDate && parseDate(effDueDate) < today) return 'delayed';
  if (t.isUrgent) return 'urgent';
  if (s === 4 || s === 5) return 'active';
  return 'planned';
}

const CHIP: Record<VisualTier, { accent: string; bg: string; text: string; subText: string; border: string; muted: boolean }> = {
  delayed: { accent:'#f97316', bg:'#fffaf5', text:'#c2410c', subText:'#f8a97a', border:'#fed7aa', muted:false },
  urgent:  { accent:'#ef4444', bg:'#fff5f5', text:'#991b1b', subText:'#ef9393', border:'#fecaca', muted:false },
  active:  { accent:'#2563eb', bg:'#eff6ff', text:'#1d4ed8', subText:'#93c5fd', border:'#bfdbfe', muted:false },
  planned: { accent:'#94a3b8', bg:'#f8fafc', text:'#64748b', subText:'#94a3b8', border:'#e2e8f0', muted:false },
  done:    { accent:'#16a34a', bg:'#f0fdf4', text:'#15803d', subText:'#86efac', border:'#bbf7d0', muted:true  },
};

const TIER_SORT: VisualTier[] = ['delayed','urgent','active','planned','done'];

function delayedDays(ticket: TicketSummary, today: Date): number {
  const effDueDate = ticket.desiredDueDate ?? ticket.requestedDueDate;
  if (!effDueDate) return 0;
  const due = parseDate(effDueDate);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
}

// ── 스팬 타입 (월간/주간용) ───────────────────────────────────────────────────
interface Span { ticket: TicketSummary; start: Date; end: Date; tier: VisualTier; }
interface LanedSpan extends Span {
  lane: number; colStart: number; colEnd: number;
  isFirstWeek: boolean; isLastWeek: boolean;
}

// ── 주(week) 단위 2D 격자 배치 헬퍼 ──────────────────────────────────────────
function gridIsFree(occ: Set<number>[], row: number, colStart: number, colEnd: number): boolean {
  if (row >= occ.length) return true;
  for (let c = colStart; c <= colEnd; c++) if (occ[row].has(c)) return false;
  return true;
}
function gridClaim(occ: Set<number>[], row: number, colStart: number, colEnd: number) {
  while (occ.length <= row) occ.push(new Set());
  for (let c = colStart; c <= colEnd; c++) occ[row].add(c);
}
function gridFindRow(occ: Set<number>[], colStart: number, colEnd: number): number {
  let r = 0;
  while (!gridIsFree(occ, r, colStart, colEnd)) r++;
  return r;
}
/**
 * Overflow continuation용: blocking 이벤트가 끝난 열 이후부터 같은 row에 배치 허용.
 * 반환값: { row, effectiveColStart } — effectiveColStart는 실제 렌더링 시작 열.
 */
function gridFindRowFlex(
  occ: Set<number>[],
  colStart: number,
  colEnd: number,
): { row: number; effectiveColStart: number } {
  for (let row = 0; ; row++) {
    // blocking이 끝나는 첫 번째 빈 열 탐색
    let fc = colStart;
    const rowSet = row < occ.length ? occ[row] : null;
    while (fc <= colEnd && rowSet && rowSet.has(fc)) fc++;
    // fc 이후 colEnd까지 전부 비어있으면 배치 확정
    if (fc <= colEnd && gridIsFree(occ, row, fc, colEnd)) {
      return { row, effectiveColStart: fc };
    }
  }
}

const MAX_VISIBLE = 3;
const CHIP_H      = 22;
const CHIP_GAP    = 3;
const DATE_PAD    = 38;

const DOW_LABELS = ['일','월','화','수','목','금','토'];
const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

interface Props { tickets: TicketSummary[]; onTicketClick: (id: number) => void; }

// ══════════════════════════════════════════════════════════════════════════════
const CalendarView = ({ tickets, onTicketClick }: Props) => {
  const now = new Date();
  const [year,       setYear]       = useState(now.getFullYear());
  const [month,      setMonth]      = useState(now.getMonth());
  const [curDate,    setCurDate]    = useState(() => { const d=new Date(); d.setHours(0,0,0,0); return d; });
  const [periodMode, setPeriodMode] = useState<PeriodMode>('월간');
  const [hoverId,    setHoverId]    = useState<number | null>(null);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  // ── Span 변환 ──────────────────────────────────────────────────────────────
  const spans = useMemo<Span[]>(() =>
    tickets
      .map(t => {
        const tier  = getVisualTier(t, today);
        const start = parseDate(t.createdAt);
        const effDueDate = t.desiredDueDate ?? t.requestedDueDate;
        if (effDueDate) {
          const end = parseDate(effDueDate);
          return { ticket:t, start, end:end>=start?end:start, tier };
        }
        const days = t.difficulty===3?14:t.difficulty===2?7:t.difficulty===1?3:5;
        return { ticket:t, start, end:addDays(start,days), tier };
      })
      .sort((a,b) => TIER_SORT.indexOf(a.tier) - TIER_SORT.indexOf(b.tier)),
  [tickets, today]);

  // ── 네비게이션 ────────────────────────────────────────────────────────────
  const prevPeriod = () => {
    if (periodMode === '월간') {
      if(month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1);
    } else if (periodMode === '주간') {
      setCurDate(d => addDays(d, -7));
    } else if (periodMode === '일간') {
      setCurDate(d => addDays(d, -1));
    } else {
      if(month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1);
    }
  };
  const nextPeriod = () => {
    if (periodMode === '월간') {
      if(month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1);
    } else if (periodMode === '주간') {
      setCurDate(d => addDays(d, 7));
    } else if (periodMode === '일간') {
      setCurDate(d => addDays(d, 1));
    } else {
      if(month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1);
    }
  };
  const goToday = () => {
    const d = new Date(); d.setHours(0,0,0,0);
    setCurDate(d); setYear(d.getFullYear()); setMonth(d.getMonth());
  };

  // ── 헤더 레이블 ───────────────────────────────────────────────────────────
  const headerLabel = useMemo(() => {
    if (periodMode === '월간' || periodMode === '목록') return `${year}년 ${MONTH_NAMES[month]}`;
    if (periodMode === '주간') {
      const ws = startOfWeek(curDate);
      const we = addDays(ws, 6);
      return `${ws.getFullYear()}년 ${MONTH_NAMES[ws.getMonth()]} ${ws.getDate()}일 – ${we.getMonth()!==ws.getMonth()?MONTH_NAMES[we.getMonth()]+' ':''}${we.getDate()}일`;
    }
    return `${curDate.getFullYear()}년 ${MONTH_NAMES[curDate.getMonth()]} ${curDate.getDate()}일`;
  }, [periodMode, year, month, curDate]);

  // ── 통계 (월간/목록 기준) ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    const mStart = new Date(year, month, 1);
    const mEnd   = new Date(year, month+1, 0);
    const inMonth = tickets.filter(t => {
      const s = parseDate(t.createdAt);
      const effDate = t.desiredDueDate ?? t.requestedDueDate;
      const e = effDate ? parseDate(effDate) : s;
      return s <= mEnd && e >= mStart;
    });
    return {
      total:   inMonth.length,
      delayed: inMonth.filter(t => { const ed = t.desiredDueDate ?? t.requestedDueDate; return ed && parseDate(ed)<today && (t.status as number)!==6; }).length,
      urgent:  inMonth.filter(t => t.isUrgent && (t.status as number)!==6).length,
      active:  inMonth.filter(t => { const s=t.status as number; return s===4||s===5; }).length,
    };
  }, [tickets, year, month, today]);

  return (
    <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', background:'#fff' }}>

      {/* ══ 헤더 ══ */}
      <div style={{
        display:'flex', alignItems:'center',
        padding:'12px 16px 10px',
        borderBottom:'1px solid #e7e5e4', flexShrink:0,
        background:'#fff', gap:12,
      }}>
        {/* 네비게이션 (왼쪽) */}
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <button onClick={prevPeriod} style={navBtnStyle()}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button onClick={goToday} style={navBtnStyle(true)}>오늘</button>
          <button onClick={nextPeriod} style={navBtnStyle()}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        {/* 연월 — 중앙 */}
        <div style={{ flex:1, textAlign:'center' }}>
          <span style={{ fontSize:18, fontWeight:700, color:'#1c1917', letterSpacing:'-0.3px' }}>
            {headerLabel}
          </span>
        </div>

        {/* 통계 + 뷰 모드 (오른쪽) */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* 기간 모드 탭 */}
          <div style={{
            display:'flex', alignItems:'center',
            border:'1px solid #E5E7EB', borderRadius:8, overflow:'hidden',
          }}>
            {PERIOD_MODES.map(m => (
              <button
                key={m}
                onClick={() => setPeriodMode(m)}
                style={{
                  padding:'5px 12px', fontSize:12,
                  fontWeight: periodMode===m ? 600 : 400,
                  border:'none',
                  borderRight: m!=='목록' ? '1px solid #E5E7EB' : 'none',
                  background: periodMode===m ? '#111827' : '#fff',
                  color:      periodMode===m ? '#fff'    : '#6B7280',
                  cursor:'pointer',
                  transition:'background .1s, color .1s',
                }}
              >{m}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ══ 뷰 본문 ══ */}
      {periodMode === '월간' && (
        <MonthlyView
          year={year} month={month} today={today}
          spans={spans} hoverId={hoverId}
          setHoverId={setHoverId}
          onTicketClick={onTicketClick}
        />
      )}
      {periodMode === '주간' && (
        <WeeklyView
          curDate={curDate} today={today}
          spans={spans} hoverId={hoverId}
          setHoverId={setHoverId}
          onTicketClick={onTicketClick}
        />
      )}
      {periodMode === '일간' && (
        <DailyView
          curDate={curDate} today={today}
          spans={spans}
          onTicketClick={onTicketClick}
        />
      )}
      {periodMode === '목록' && (
        <ListView
          year={year} month={month} today={today}
          tickets={tickets}
          onTicketClick={onTicketClick}
        />
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// 월간 뷰
// ══════════════════════════════════════════════════════════════════════════════
const MonthlyView = ({
  year, month, today, spans, hoverId, setHoverId, onTicketClick,
}: {
  year:number; month:number; today:Date;
  spans:Span[]; hoverId:number|null;
  setHoverId:(id:number|null)=>void;
  onTicketClick:(id:number)=>void;
}) => {
  const [popover, setPopover] = useState<{ tickets: TicketSummary[]; date: Date; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!popover) return;
    const h = () => setPopover(null);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [popover]);

  const firstDow   = new Date(year, month, 1).getDay();
  const calStart   = addDays(new Date(year, month, 1), -firstDow);
  const numDays    = daysInMonth(year, month);
  const totalCells = Math.ceil((firstDow + numDays) / 7) * 7;
  const numWeeks   = totalCells / 7;

  const weeks = useMemo<Date[][]>(() => {
    const ws: Date[][] = [];
    for (let w=0; w<numWeeks; w++) {
      const wk:Date[]=[];
      for (let d=0;d<7;d++) wk.push(addDays(calStart,w*7+d));
      ws.push(wk);
    }
    return ws;
  }, [year, month]); // eslint-disable-line

  // FullCalendar dayGridMonth 방식:
  // persistedRows 로 멀티데이 일정의 Row를 주(week)가 바뀌어도 유지
  const weekLaned = useMemo<LanedSpan[][]>(() => {
    // ticketId → 이전 주에서 배정된 row (주 경계를 넘는 일정의 row 일관성 보장)
    const persistedRows = new Map<number, number>();

    return weeks.map(week => {
      const wStart = week[0], wEnd = week[6];

      const weekSpans = spans
        .filter(s => s.start <= wEnd && s.end >= wStart)
        .map<LanedSpan>(s => ({
          ...s, lane: -1,
          colStart: s.start < wStart ? 0 : s.start.getDay(),
          colEnd:   s.end > wEnd ? 6 : Math.max(s.start < wStart ? 0 : s.start.getDay(), s.end.getDay()),
          isFirstWeek: s.start >= wStart && s.start <= wEnd,
          isLastWeek:  s.end >= wStart   && s.end <= wEnd,
        }));

      // 2D 격자: occ[row] = 이 주에서 점유된 열(column) Set
      const occ: Set<number>[] = [];
      const result: LanedSpan[] = [];

      // ── 1a) Visible continuation: 이전 주에서 visible row(< MAX_VISIBLE)로 이어지는 일정
      //        → 같은 row 유지 (시각적 일관성)
      const visCont = weekSpans
        .filter(s => !s.isFirstWeek && (persistedRows.get(s.ticket.id) ?? 99) < MAX_VISIBLE)
        .sort((a, b) => (persistedRows.get(a.ticket.id) ?? 99) - (persistedRows.get(b.ticket.id) ?? 99));

      for (const s of visCont) {
        const prev = persistedRows.get(s.ticket.id)!;
        const row = gridIsFree(occ, prev, s.colStart, s.colEnd)
          ? prev
          : gridFindRow(occ, s.colStart, s.colEnd);
        gridClaim(occ, row, s.colStart, s.colEnd);
        persistedRows.set(s.ticket.id, row);
        result.push({ ...s, lane: row });
      }

      // ── 1b) Overflow continuation: 이전 주에서 overflow(>= MAX_VISIBLE)였던 이어지는 일정
      //        → Flexible start로 재탐색: blocking 이벤트 종료 이후 열부터 visible row 진입 허용
      //        정렬: 총 기간 내림차순 (긴 일정이 낮은 row 선점)
      const ovfCont = weekSpans
        .filter(s => !s.isFirstWeek && (persistedRows.get(s.ticket.id) ?? 99) >= MAX_VISIBLE)
        .sort((a, b) => {
          const durDiff = (b.end.getTime() - b.start.getTime()) - (a.end.getTime() - a.start.getTime());
          return durDiff !== 0 ? durDiff : a.start.getTime() - b.start.getTime();
        });

      for (const s of ovfCont) {
        const { row, effectiveColStart } = gridFindRowFlex(occ, s.colStart, s.colEnd);
        gridClaim(occ, row, effectiveColStart, s.colEnd);
        persistedRows.set(s.ticket.id, row);
        result.push({ ...s, lane: row, colStart: effectiveColStart });
      }

      // ── 2) 이번 주 시작 멀티컬럼 일정
      //        정렬: 총 기간 내림차순 → 시작일 오름차순 (이번 주 컬럼 span이 아닌 실제 기간 기준)
      const newMulti = weekSpans
        .filter(s => s.isFirstWeek && s.colEnd > s.colStart)
        .sort((a, b) => {
          const durDiff = (b.end.getTime() - b.start.getTime()) - (a.end.getTime() - a.start.getTime());
          return durDiff !== 0 ? durDiff : a.start.getTime() - b.start.getTime();
        });

      for (const s of newMulti) {
        const row = gridFindRow(occ, s.colStart, s.colEnd);
        gridClaim(occ, row, s.colStart, s.colEnd);
        persistedRows.set(s.ticket.id, row);
        result.push({ ...s, lane: row });
      }

      // ── 3) 단일 열 일정 ──
      const singleCol = weekSpans
        .filter(s => s.isFirstWeek && s.colEnd === s.colStart)
        .sort((a, b) => TIER_SORT.indexOf(a.tier) - TIER_SORT.indexOf(b.tier) || a.colStart - b.colStart);

      for (const s of singleCol) {
        const row = gridFindRow(occ, s.colStart, s.colEnd);
        gridClaim(occ, row, s.colStart, s.colEnd);
        if (s.end > s.start) persistedRows.set(s.ticket.id, row);
        result.push({ ...s, lane: row });
      }

      return result;
    });
  }, [spans, weeks]);

  return (
    <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column' }}>
      {/* 요일 헤더 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid #e7e5e4', flexShrink:0, background:'#fafaf9' }}>
        {DOW_LABELS.map((d,i) => (
          <div key={d} style={{
            padding:'6px 0', fontSize:11, fontWeight:700, letterSpacing:'.5px',
            color: i===0?'#ef4444':i===6?'#6366f1':'#a8a29e',
            borderRight: i<6?'1px solid #f0ece8':'none',
            textAlign:'center',
          }}>{d}</div>
        ))}
      </div>

      {/* 주 rows */}
      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column' }}>
        {weeks.map((week, wi) => {
          const laned   = weekLaned[wi];
          const visible = laned.filter(s=>s.lane<MAX_VISIBLE);
          const hidden  = laned.filter(s=>s.lane>=MAX_VISIBLE);
          // Step 1: 날짜별 전체 일정 수집
          const allTicketsByCol = new Map<number, TicketSummary[]>();
          for (let c = 0; c < 7; c++) allTicketsByCol.set(c, []);
          laned.forEach(s => {
            for (let c = s.colStart; c <= s.colEnd; c++) {
              const arr = allTicketsByCol.get(c)!;
              if (!arr.find(t => t.id === s.ticket.id)) arr.push(s.ticket);
            }
          });
          // Step 4~5: 날짜별 실제 초과분만 집계
          const hiddenByCol = new Map<number, number>();
          hidden.forEach(s => {
            for (let c = s.colStart; c <= s.colEnd; c++) {
              hiddenByCol.set(c, (hiddenByCol.get(c) ?? 0) + 1);
            }
          });
          const lanesUsed = Math.min(laned.length>0?Math.max(...laned.map(s=>s.lane))+1:0,MAX_VISIBLE);
          const hasAnyHidden = hidden.length > 0;
          const minH = DATE_PAD + lanesUsed*(CHIP_H+CHIP_GAP) + (hasAnyHidden ? CHIP_H+10 : 8);

          return (
            <div key={wi} style={{
              flexShrink: 0,
              height: Math.max(minH, 110),
              display:'grid', gridTemplateColumns:'repeat(7,1fr)',
              borderBottom: wi<numWeeks-1?'1px solid #e7e5e4':'none',
              position:'relative',
              overflow:'hidden',
            }}>
              {week.map((date,di) => {
                const inCurrent = date.getMonth()===month;
                const isTodayD  = sameDay(date,today);
                const extraCnt  = hiddenByCol.get(di)??0;
                return (
                  <div key={di} style={{
                    borderRight: di<6?'1px solid #f0ece8':'none',
                    background: isTodayD?'#fffbf5':!inCurrent?'#fafaf9':'#fff',
                    padding:'5px 8px 4px', position:'relative',
                  }}>
                    {isTodayD && <div style={{position:'absolute',top:0,left:0,right:0,height:2.5,background:'#a7743a'}}/>}
                    {isTodayD ? (
                      <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:28,height:28,borderRadius:'50%',background:'#a7743a',color:'#fff',fontSize:15,fontWeight:700}}>{date.getDate()}</div>
                    ) : (
                      <span style={{fontSize:15,fontWeight:inCurrent?600:400,color:!inCurrent?'#d4d0cc':di===0?'#ef4444':di===6?'#6366f1':'#374151'}}>{date.getDate()}</span>
                    )}
                    {extraCnt>0 && (
                      <button
                        onMouseDown={e=>e.stopPropagation()}
                        onClick={e=>{
                          e.stopPropagation();
                          const tickets = allTicketsByCol.get(di) ?? [];
                          setPopover({ tickets, date, x: e.clientX, y: e.clientY });
                        }}
                        style={{
                          position:'absolute', bottom:4, left:6,
                          fontSize:10, fontWeight:600, color:'#a7743a',
                          background:'#fdf5ea', border:'1px solid #e5c99a',
                          borderRadius:4, padding:'1px 6px', cursor:'pointer',
                          lineHeight:'16px', zIndex:30,
                        }}
                      >+{extraCnt}</button>
                    )}
                  </div>
                );
              })}

              {visible.map((s,si) => {
                const chip   = CHIP[s.tier];
                const colPct = 100/7;
                const topPx  = DATE_PAD + s.lane*(CHIP_H+CHIP_GAP);
                const isHover= hoverId===s.ticket.id;
                const showLead = s.isFirstWeek||wi===0;
                const rL = s.isFirstWeek?4:0, rR = s.isLastWeek?4:0;

                return (
                  <div
                    key={`${s.ticket.id}-w${wi}-${si}`}
                    onClick={()=>onTicketClick(s.ticket.id)}
                    onMouseEnter={()=>setHoverId(s.ticket.id)}
                    onMouseLeave={()=>setHoverId(null)}
                    title={`${s.ticket.ticketNo} ${s.ticket.title}${s.ticket.assigneeName?' · '+s.ticket.assigneeName:''}`}
                    style={{
                      position:'absolute',
                      left:`calc(${s.colStart*colPct}% + ${s.isFirstWeek?3:0}px)`,
                      width:`calc(${(s.colEnd-s.colStart+1)*colPct}% - ${(s.isFirstWeek?3:0)+(s.isLastWeek?3:0)+1}px)`,
                      top:topPx, height:CHIP_H,
                      borderRadius:`${rL}px ${rR}px ${rR}px ${rL}px`,
                      background:chip.bg,
                      borderLeft:   s.isFirstWeek?`3px solid ${chip.accent}`:`1px solid ${chip.border}`,
                      borderTop:    `1px solid ${chip.border}`,
                      borderBottom: `1px solid ${chip.border}`,
                      borderRight:  s.isLastWeek?`1px solid ${chip.border}`:'none',
                      cursor:'pointer', display:'flex', alignItems:'center',
                      paddingLeft:s.isFirstWeek?5:4, paddingRight:6, overflow:'hidden',
                      zIndex:isHover?20:s.tier==='delayed'?5:s.tier==='urgent'?4:s.tier==='active'?3:2,
                      boxShadow:isHover?'0 2px 8px rgba(0,0,0,.14)':'none',
                      opacity:chip.muted&&!isHover?0.55:1,
                      transition:'box-shadow .12s, opacity .12s',
                    }}
                  >
                    {showLead ? (
                      <div style={{display:'flex',alignItems:'center',gap:4,flex:1,overflow:'hidden',minWidth:0}}>
                        <span style={{fontSize:10.5,fontWeight:700,color:chip.accent,whiteSpace:'nowrap',flexShrink:0,textDecoration:chip.muted?'line-through':'none'}}>{s.ticket.ticketNo}</span>
                        <span style={{fontSize:10.5,fontWeight:400,color:chip.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textDecoration:chip.muted?'line-through':'none'}}>{s.ticket.title}</span>
                      </div>
                    ) : <div style={{flex:1}}/>}
                    {s.tier === 'delayed' && (() => { const d = delayedDays(s.ticket, today); return d > 0 ? <span style={{fontSize:10,fontWeight:700,color:chip.accent,whiteSpace:'nowrap',flexShrink:0,marginLeft:4}}>+{d}일</span> : null; })()}
                    {s.ticket.assigneeName && (
                      <span style={{fontSize:10,fontWeight:500,color:chip.subText,whiteSpace:'nowrap',flexShrink:0,marginLeft:2}}>{s.ticket.assigneeName}</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* 범례 */}
      <div style={{display:'flex',gap:16,padding:'7px 16px',borderTop:'1px solid #f0ece8',flexShrink:0,background:'#fafaf9'}}>
        {([['delayed','지연'],['urgent','긴급'],['active','진행중'],['planned','예정'],['done','완료']] as [VisualTier,string][]).map(([tier,label])=>{
          const c=CHIP[tier];
          return (
            <div key={tier} style={{display:'flex',alignItems:'center',gap:5,fontSize:10.5,color:'#78716c'}}>
              <div style={{width:14,height:10,borderRadius:2,background:c.bg,border:`1px solid ${c.border}`,borderLeftColor:c.accent,borderLeftWidth:3,opacity:c.muted?0.55:1}}/>
              {label}
            </div>
          );
        })}
      </div>

      {/* 팝오버 */}
      {popover && (
        <div
          onMouseDown={e=>e.stopPropagation()}
          style={{
            position:'fixed',
            left: Math.min(popover.x, window.innerWidth - 300),
            top:  Math.min(popover.y + 4, window.innerHeight - 320),
            zIndex:1000,
            background:'#fff',
            border:'1px solid #e7e5e4',
            borderRadius:12,
            boxShadow:'0 8px 24px rgba(0,0,0,.14)',
            minWidth:260, maxWidth:320,
            overflow:'hidden',
          }}
        >
          <div style={{padding:'10px 14px 8px',borderBottom:'1px solid #f0ece8',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>
              {popover.date.getMonth()+1}월 {popover.date.getDate()}일
              <span style={{marginLeft:6,fontSize:11,color:'#a8a29e',fontWeight:400}}>{popover.tickets.length}건 더보기</span>
            </span>
            <button onClick={()=>setPopover(null)} style={{background:'none',border:'none',cursor:'pointer',color:'#a8a29e',padding:'0 2px',fontSize:14,lineHeight:1}}>×</button>
          </div>
          <div style={{maxHeight:260,overflowY:'auto',padding:'6px 8px'}}>
            {popover.tickets.map(t=>{
              const chip=CHIP[getVisualTier(t,today)];
              const effPopDate = t.desiredDueDate ?? t.requestedDueDate;
              const isMultiDay = !!effPopDate && new Date(effPopDate) > new Date(t.createdAt.slice(0,10));
              return (
                <div
                  key={t.id}
                  onClick={()=>{ onTicketClick(t.id); setPopover(null); }}
                  style={{
                    display:'flex', alignItems:'center', gap:8,
                    padding:'7px 10px', marginBottom:3, borderRadius:7,
                    background:chip.bg,
                    borderLeft:`3px solid ${chip.accent}`,
                    cursor:'pointer', transition:'opacity .1s',
                  }}
                  onMouseEnter={e=>(e.currentTarget.style.opacity='0.8')}
                  onMouseLeave={e=>(e.currentTarget.style.opacity='1')}
                >
                  {isMultiDay && <span style={{fontSize:8,color:chip.accent,flexShrink:0,lineHeight:1}}>▶</span>}
                  <span style={{fontSize:10.5,fontWeight:700,color:chip.accent,whiteSpace:'nowrap',flexShrink:0}}>{t.ticketNo}</span>
                  <span style={{fontSize:11,color:chip.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{t.title}</span>
                  {t.assigneeName && <span style={{fontSize:10.5,color:chip.subText,whiteSpace:'nowrap',flexShrink:0}}>{t.assigneeName}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// 주간 뷰
// ══════════════════════════════════════════════════════════════════════════════
const WeeklyView = ({
  curDate, today, spans, hoverId, setHoverId, onTicketClick,
}: {
  curDate:Date; today:Date;
  spans:Span[]; hoverId:number|null;
  setHoverId:(id:number|null)=>void;
  onTicketClick:(id:number)=>void;
}) => {
  const weekStart = useMemo(()=>startOfWeek(curDate),[curDate]);
  const weekDays  = useMemo(()=>Array.from({length:7},(_,i)=>addDays(weekStart,i)),[weekStart]);
  const weekEnd   = weekDays[6];

  // 주간 뷰: 단일 주이므로 persistedRows 불필요, 2D 격자 배치만 적용
  const laned = useMemo<LanedSpan[]>(()=>{
    const weekSpans = spans
      .filter(s=>s.start<=weekEnd && s.end>=weekStart)
      .map<LanedSpan>(s=>({
        ...s, lane:-1,
        colStart: s.start<weekStart ? 0 : s.start.getDay(),
        colEnd:   s.end>weekEnd     ? 6 : Math.max(s.start<weekStart?0:s.start.getDay(), s.end.getDay()),
        isFirstWeek: s.start>=weekStart && s.start<=weekEnd,
        isLastWeek:  s.end>=weekStart   && s.end<=weekEnd,
      }));

    const occ: Set<number>[] = [];
    const result: LanedSpan[] = [];

    // 멀티컬럼 먼저 (긴 것부터)
    const multiCol = weekSpans
      .filter(s => s.colEnd > s.colStart)
      .sort((a, b) => (b.colEnd - b.colStart) - (a.colEnd - a.colStart) || a.colStart - b.colStart);
    for (const s of multiCol) {
      const row = gridFindRow(occ, s.colStart, s.colEnd);
      gridClaim(occ, row, s.colStart, s.colEnd);
      result.push({ ...s, lane: row });
    }

    // 단일 열 나머지
    const singleCol = weekSpans
      .filter(s => s.colEnd === s.colStart)
      .sort((a, b) => TIER_SORT.indexOf(a.tier) - TIER_SORT.indexOf(b.tier) || a.colStart - b.colStart);
    for (const s of singleCol) {
      const row = gridFindRow(occ, s.colStart, s.colEnd);
      gridClaim(occ, row, s.colStart, s.colEnd);
      result.push({ ...s, lane: row });
    }

    return result;
  },[spans,weekStart,weekEnd]); // eslint-disable-line

  const WEEK_CHIP_H  = 26;
  const WEEK_CHIP_GAP= 4;
  const WEEK_DATE_H  = 56; // 요일 헤더 높이
  const maxLane = laned.length>0 ? Math.max(...laned.map(s=>s.lane)) : -1;
  const contentH = Math.max((maxLane+1)*(WEEK_CHIP_H+WEEK_CHIP_GAP)+16, 80);

  return (
    <div style={{flex:1,minHeight:0,display:'flex',flexDirection:'column',overflow:'auto'}}>

      {/* ── 날짜 헤더 + 바 영역 (position:relative) ── */}
      <div style={{position:'relative',minHeight: WEEK_DATE_H + contentH}}>

        {/* 요일 + 날짜 헤더 행 */}
        <div style={{
          display:'grid', gridTemplateColumns:'repeat(7,1fr)',
          borderBottom:'1px solid #e7e5e4',
          background:'#fafaf9',
          position:'sticky', top:0, zIndex:10,
        }}>
          {weekDays.map((d,i)=>{
            const isT=sameDay(d,today);
            return (
              <div key={i} style={{
                padding:'8px 0 6px', textAlign:'center',
                borderRight:i<6?'1px solid #f0ece8':'none',
                borderTop: isT?'2.5px solid #a7743a':'2.5px solid transparent',
                background: isT?'#fffbf5':'#fafaf9',
              }}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:'.4px',
                  color:i===0?'#ef4444':i===6?'#6366f1':'#a8a29e'}}>{DOW_LABELS[i]}</div>
                <div style={{
                  display:'inline-flex',alignItems:'center',justifyContent:'center',
                  width:28,height:28,borderRadius:'50%',marginTop:2,
                  background:isT?'#a7743a':'transparent',
                  fontSize:15,fontWeight:isT?700:500,
                  color:isT?'#fff':i===0?'#ef4444':i===6?'#6366f1':'#374151',
                }}>{d.getDate()}</div>
              </div>
            );
          })}
        </div>

        {/* 날짜 열 구분선 배경 */}
        <div style={{
          position:'absolute', top: WEEK_DATE_H, left:0, right:0, bottom:0,
          display:'grid', gridTemplateColumns:'repeat(7,1fr)', pointerEvents:'none',
        }}>
          {weekDays.map((d,i)=>(
            <div key={i} style={{
              borderRight:i<6?'1px solid #f0ece8':'none',
              background:sameDay(d,today)?'#fffbf5':'#fff',
            }}/>
          ))}
        </div>

        {/* 티켓 바 — absolute */}
        {laned.map((s,si)=>{
          const chip    = CHIP[s.tier];
          const isHover = hoverId===s.ticket.id;
          const colPct  = 100/7;
          const leftPct = s.colStart * colPct;
          const wPct    = (s.colEnd-s.colStart+1)*colPct;
          const topPx   = WEEK_DATE_H + s.lane*(WEEK_CHIP_H+WEEK_CHIP_GAP)+8;
          const rL = s.isFirstWeek?5:0, rR = s.isLastWeek?5:0;

          return (
            <div
              key={`${s.ticket.id}-${si}`}
              onClick={()=>onTicketClick(s.ticket.id)}
              onMouseEnter={()=>setHoverId(s.ticket.id)}
              onMouseLeave={()=>setHoverId(null)}
              title={`${s.ticket.ticketNo} ${s.ticket.title}${s.ticket.assigneeName?' · '+s.ticket.assigneeName:''}`}
              style={{
                position:'absolute',
                left: `calc(${leftPct}% + ${s.isFirstWeek?4:0}px)`,
                width:`calc(${wPct}% - ${(s.isFirstWeek?4:0)+(s.isLastWeek?4:0)+1}px)`,
                top: topPx,
                height: WEEK_CHIP_H,
                borderRadius:`${rL}px ${rR}px ${rR}px ${rL}px`,
                background: chip.bg,
                borderLeft:   s.isFirstWeek?`3px solid ${chip.accent}`:`1px solid ${chip.border}`,
                borderTop:    `1px solid ${chip.border}`,
                borderBottom: `1px solid ${chip.border}`,
                borderRight:  s.isLastWeek?`1px solid ${chip.border}`:'none',
                cursor:'pointer',
                display:'flex', alignItems:'center',
                paddingLeft: s.isFirstWeek?6:4,
                paddingRight:6, overflow:'hidden',
                zIndex: isHover?20:s.tier==='delayed'?5:s.tier==='urgent'?4:s.tier==='active'?3:2,
                boxShadow:isHover?'0 2px 10px rgba(0,0,0,.14)':'none',
                opacity:chip.muted&&!isHover?0.55:1,
                transition:'box-shadow .12s, opacity .12s',
              }}
            >
              {/* 왼쪽: 티켓번호 + 제목 (시작 지점에서만) */}
              {(s.isFirstWeek) ? (
                <div style={{display:'flex',alignItems:'center',gap:5,flex:1,overflow:'hidden',minWidth:0}}>
                  <span style={{fontSize:11,fontWeight:700,color:chip.accent,whiteSpace:'nowrap',flexShrink:0,textDecoration:chip.muted?'line-through':'none'}}>
                    {s.ticket.ticketNo}
                  </span>
                  <span style={{fontSize:11,fontWeight:400,color:chip.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textDecoration:chip.muted?'line-through':'none'}}>
                    {s.ticket.title}
                  </span>
                </div>
              ) : <div style={{flex:1}}/>}
              {/* 오른쪽: 지연일수 + 담당자 */}
              {s.tier === 'delayed' && (() => { const d = delayedDays(s.ticket, today); return d > 0 ? <span style={{fontSize:10.5,fontWeight:700,color:chip.accent,whiteSpace:'nowrap',flexShrink:0,marginLeft:4}}>+{d}일</span> : null; })()}
              {s.ticket.assigneeName && (
                <span style={{fontSize:10.5,fontWeight:500,color:chip.subText,whiteSpace:'nowrap',flexShrink:0,marginLeft:2}}>
                  {s.ticket.assigneeName}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// 일간 뷰
// ══════════════════════════════════════════════════════════════════════════════
const DailyView = ({
  curDate, today, spans, onTicketClick,
}: {
  curDate:Date; today:Date;
  spans:Span[];
  onTicketClick:(id:number)=>void;
}) => {
  const daySpans = useMemo(()=>
    spans.filter(s=>s.start<=curDate && s.end>=curDate),
  [spans,curDate]);

  const isT = sameDay(curDate,today);

  return (
    <div style={{flex:1,minHeight:0,overflow:'auto',padding:'16px 24px'}}>
      {/* 날짜 헤더 */}
      <div style={{marginBottom:16,paddingBottom:12,borderBottom:'1px solid #f0ece8',display:'flex',alignItems:'center',gap:10}}>
        <div style={{
          width:44,height:44,borderRadius:'50%',
          display:'flex',alignItems:'center',justifyContent:'center',
          background:isT?'#a7743a':'#f3f4f6',
          fontSize:20,fontWeight:700,
          color:isT?'#fff':'#374151',
        }}>{curDate.getDate()}</div>
        <div>
          <div style={{fontSize:13,fontWeight:600,color:'#374151'}}>{DOW_LABELS[curDate.getDay()]}요일</div>
          <div style={{fontSize:11,color:'#a8a29e'}}>{daySpans.length}건의 티켓</div>
        </div>
      </div>

      {daySpans.length===0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#d4d0cc',fontSize:13}}>이 날짜에 해당하는 티켓이 없습니다</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {daySpans.map(s=>{
            const chip=CHIP[s.tier];
            return (
              <div
                key={s.ticket.id}
                onClick={()=>onTicketClick(s.ticket.id)}
                style={{
                  display:'flex',alignItems:'center',gap:12,
                  padding:'10px 14px 10px 12px',
                  borderRadius:8,
                  borderLeft:`4px solid ${chip.accent}`,
                  background:chip.bg,
                  border:`1px solid ${chip.border}`,
                  borderLeftWidth:4,borderLeftColor:chip.accent,
                  cursor:'pointer',
                  opacity:chip.muted?0.6:1,
                  transition:'box-shadow .12s',
                }}
                onMouseEnter={e=>(e.currentTarget.style.boxShadow='0 2px 10px rgba(0,0,0,.1)')}
                onMouseLeave={e=>(e.currentTarget.style.boxShadow='none')}
              >
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                    <span style={{fontSize:11,fontWeight:700,color:chip.accent,textDecoration:chip.muted?'line-through':'none'}}>{s.ticket.ticketNo}</span>
                    <span style={{fontSize:12,fontWeight:500,color:chip.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textDecoration:chip.muted?'line-through':'none'}}>{s.ticket.title}</span>
                  </div>
                  <div style={{fontSize:11,color:'#a8a29e'}}>
                    {(s.ticket.desiredDueDate ?? s.ticket.requestedDueDate) && `기한 ${fmtDate(parseDate((s.ticket.desiredDueDate ?? s.ticket.requestedDueDate)!))}`}
                    {s.ticket.productName && <span style={{marginLeft:8}}>{s.ticket.productName}</span>}
                  </div>
                </div>
                {s.ticket.assigneeName && (
                  <span style={{fontSize:12,fontWeight:600,color:chip.text,whiteSpace:'nowrap',flexShrink:0}}>{s.ticket.assigneeName}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// 목록 뷰
// ══════════════════════════════════════════════════════════════════════════════
const ListView = ({
  year, month, today, tickets, onTicketClick,
}: {
  year:number; month:number; today:Date;
  tickets:TicketSummary[];
  onTicketClick:(id:number)=>void;
}) => {
  const mStart = new Date(year, month, 1);
  const mEnd   = new Date(year, month+1, 0);

  const grouped = useMemo(()=>{
    const inMonth = tickets.filter(t=>{
      const s=parseDate(t.createdAt);
      const listEffDate = t.desiredDueDate ?? t.requestedDueDate;
      const e=listEffDate?parseDate(listEffDate):s;
      return s<=mEnd && e>=mStart;
    });

    // 티어별로 그루핑
    const groups: Record<VisualTier, TicketSummary[]> = {
      delayed:[], urgent:[], active:[], planned:[], done:[],
    };
    inMonth.forEach(t=> groups[getVisualTier(t,today)].push(t));
    return groups;
  },[tickets,year,month,today]); // eslint-disable-line

  const GROUP_META: {tier:VisualTier; label:string}[] = [
    {tier:'delayed',label:'지연'},
    {tier:'urgent', label:'긴급'},
    {tier:'active', label:'진행중'},
    {tier:'planned',label:'예정'},
    {tier:'done',   label:'완료'},
  ];

  return (
    <div style={{flex:1,minHeight:0,overflow:'auto',padding:'12px 20px'}}>
      {GROUP_META.map(({tier,label})=>{
        const items=grouped[tier];
        if(!items.length) return null;
        const chip=CHIP[tier];
        return (
          <div key={tier} style={{marginBottom:20}}>
            {/* 그룹 헤더 */}
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <div style={{width:3,height:14,borderRadius:2,background:chip.accent}}/>
              <span style={{fontSize:12,fontWeight:700,color:chip.text}}>{label}</span>
              <span style={{fontSize:11,color:'#a8a29e'}}>{items.length}건</span>
            </div>

            {/* 티켓 행들 */}
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              {items.map(t=>(
                <div
                  key={t.id}
                  onClick={()=>onTicketClick(t.id)}
                  style={{
                    display:'grid',
                    gridTemplateColumns:'100px 1fr 80px 80px 90px',
                    alignItems:'center',
                    gap:8,
                    padding:'7px 12px',
                    borderRadius:6,
                    background:chip.bg,
                    border:`1px solid ${chip.border}`,
                    borderLeftWidth:3,borderLeftColor:chip.accent,
                    cursor:'pointer',
                    opacity:chip.muted?0.6:1,
                    transition:'box-shadow .1s',
                  }}
                  onMouseEnter={e=>(e.currentTarget.style.boxShadow='0 1px 6px rgba(0,0,0,.1)')}
                  onMouseLeave={e=>(e.currentTarget.style.boxShadow='none')}
                >
                  <span style={{fontSize:11,fontWeight:700,color:chip.accent,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textDecoration:chip.muted?'line-through':'none'}}>{t.ticketNo}</span>
                  <span style={{fontSize:12,fontWeight:400,color:chip.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textDecoration:chip.muted?'line-through':'none'}}>{t.title}</span>
                  <span style={{fontSize:11,color:'#a8a29e',whiteSpace:'nowrap'}}>{t.productName??'-'}</span>
                  <span style={{fontSize:11,color:'#a8a29e',whiteSpace:'nowrap'}}>{(t.desiredDueDate??t.requestedDueDate)?fmtDate(parseDate((t.desiredDueDate??t.requestedDueDate)!)):'-'}</span>
                  <span style={{fontSize:11,fontWeight:500,color:chip.text,textAlign:'right',whiteSpace:'nowrap'}}>{t.assigneeName??'-'}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── 서브 컴포넌트 ────────────────────────────────────────────────────────────
function StatChip({ label, color, bg, border }: { label:string; color:string; bg:string; border:string }) {
  return (
    <span style={{fontSize:10,fontWeight:500,padding:'2px 7px',borderRadius:10,background:bg,color,border:`1px solid ${border}`}}>{label}</span>
  );
}

function navBtnStyle(_active?: boolean): React.CSSProperties {
  return {
    height:30,padding:'0 10px',borderRadius:6,
    display:'inline-flex',alignItems:'center',justifyContent:'center',gap:3,
    border:'1px solid #E5E7EB',
    background:'#fff',
    color:'#6B7280',
    fontSize:12,fontWeight:400,
    cursor:'pointer',
  };
}

export default CalendarView;

-- ============================================================
-- V3 : Phase 1 — 상태 흐름 재설계 + 신규 필드 추가
--
-- 새 상태 매핑:
--   1 = 검토대기  (PENDING_REVIEW)  ← 기존 WAITING(1) 동일
--   2 = 검토완료  (REVIEW_DONE)     ← 신규
--   3 = 진행가능  (READY)           ← 신규
--   4 = 진행중    (IN_PROGRESS)     ← 기존 IN_PROGRESS(2)
--   5 = QA        (QA_REVIEW)       ← 기존 QA_REVIEW(3)
--   6 = 완료      (DONE)            ← 기존 DONE(4)
--   7 = 보류      (ON_HOLD)         ← 기존 ON_HOLD(5)
--   8 = 반려      (REJECTED)        ← 기존 REJECTED(6)
-- ============================================================

-- ── 1. 기존 상태값 리매핑 (충돌 방지를 위해 내림차순 실행) ──────────

-- 반려(6) → 8
UPDATE dts_tickets      SET status      = 8 WHERE status      = 6;
UPDATE dts_ticket_history SET from_status = 8 WHERE from_status = 6;
UPDATE dts_ticket_history SET to_status   = 8 WHERE to_status   = 6;

-- 보류(5) → 7
UPDATE dts_tickets      SET status      = 7 WHERE status      = 5;
UPDATE dts_ticket_history SET from_status = 7 WHERE from_status = 5;
UPDATE dts_ticket_history SET to_status   = 7 WHERE to_status   = 5;

-- 완료(4) → 6
UPDATE dts_tickets      SET status      = 6 WHERE status      = 4;
UPDATE dts_ticket_history SET from_status = 6 WHERE from_status = 4;
UPDATE dts_ticket_history SET to_status   = 6 WHERE to_status   = 4;

-- QA검증(3) → 5
UPDATE dts_tickets      SET status      = 5 WHERE status      = 3;
UPDATE dts_ticket_history SET from_status = 5 WHERE from_status = 3;
UPDATE dts_ticket_history SET to_status   = 5 WHERE to_status   = 3;

-- 진행중(2) → 4
UPDATE dts_tickets      SET status      = 4 WHERE status      = 2;
UPDATE dts_ticket_history SET from_status = 4 WHERE from_status = 2;
UPDATE dts_ticket_history SET to_status   = 4 WHERE to_status   = 2;

-- 대기(1) → 검토대기(1): 값 변경 없음, 의미만 변경

-- ── 2. dts_tickets 신규 컬럼 추가 ─────────────────────────────────

-- 난이도: 1=하, 2=중, 3=상 (관리자 설정)
ALTER TABLE dts_tickets ADD COLUMN IF NOT EXISTS difficulty     SMALLINT;
-- 예상 공수
ALTER TABLE dts_tickets ADD COLUMN IF NOT EXISTS expected_effort NUMERIC(5,1);
-- 공수 단위: 'HOUR' | 'MD'
ALTER TABLE dts_tickets ADD COLUMN IF NOT EXISTS effort_unit    VARCHAR(10);
-- 우선순위: 1=낮음, 2=보통, 3=높음, 4=긴급 (관리자 설정)
ALTER TABLE dts_tickets ADD COLUMN IF NOT EXISTS priority       SMALLINT;
-- 희망 완료일 (요청자 입력)
ALTER TABLE dts_tickets ADD COLUMN IF NOT EXISTS desired_due_date DATE;
-- 요청 부서 (요청자 소속 부서명 — 자동 입력)
ALTER TABLE dts_tickets ADD COLUMN IF NOT EXISTS requesting_dept VARCHAR(100);
-- 검토/승인 담당자 ID (관리자)
ALTER TABLE dts_tickets ADD COLUMN IF NOT EXISTS reviewed_by_id   INTEGER;
ALTER TABLE dts_tickets ADD COLUMN IF NOT EXISTS reviewed_by_name VARCHAR(100);
ALTER TABLE dts_tickets ADD COLUMN IF NOT EXISTS reviewed_at      TIMESTAMPTZ;

-- ── 3. 새 티켓 유형 추가: 5 = 유지보수 ────────────────────────────
-- (TicketType enum에 MAINTENANCE(5, "MNT") 추가와 함께)
-- ticket_type 컬럼은 SMALLINT NOT NULL이므로 CHECK 제약이 없으면 그냥 삽입 가능

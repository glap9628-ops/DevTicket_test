-- ============================================================
-- V4: 검토완료(2) → 진행가능(3) 통합
-- REVIEW_DONE(2) 상태를 READY(3)로 일괄 업데이트
-- ============================================================

-- 티켓 현재 상태 마이그레이션
UPDATE dts_tickets
SET status     = 3,
    updated_at = NOW()
WHERE status = 2;

-- 이력 from_status 업데이트
UPDATE dts_ticket_history
SET from_status = 3
WHERE from_status = 2;

-- 이력 to_status 업데이트
UPDATE dts_ticket_history
SET to_status = 3
WHERE to_status = 2;

-- 요청자 희망 완료일 / 관리자 확정 완료일 분리
-- desired_due_date  → 관리자가 확정하는 완료일 (기존 컬럼 그대로 유지)
-- requested_due_date → 등록자가 티켓 생성 시 입력하는 희망일 (신규)

ALTER TABLE dts_tickets
    ADD COLUMN IF NOT EXISTS requested_due_date DATE;

-- 기존 데이터: 지금까지 desired_due_date 는 등록자가 입력한 값이므로
-- requested_due_date 로 복사하고 desired_due_date 는 NULL 로 초기화한다.
UPDATE dts_tickets
SET requested_due_date = desired_due_date,
    desired_due_date   = NULL
WHERE desired_due_date IS NOT NULL;

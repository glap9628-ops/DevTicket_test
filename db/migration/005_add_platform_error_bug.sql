-- ============================================================
-- 005: 플랫폼 구분 + Error/Bug 컬럼 추가
--      CI/CD 자동 연동 기준 데이터 구조 반영
-- ============================================================

ALTER TABLE public.dts_tickets
    ADD COLUMN IF NOT EXISTS platform  VARCHAR(50),
    ADD COLUMN IF NOT EXISTS error_bug TEXT;

-- 기존 데이터에 기본값 보정 (레거시 티켓은 UNKNOWN 처리)
UPDATE public.dts_tickets
SET platform = 'UNKNOWN'
WHERE platform IS NULL;

-- 인덱스: 플랫폼 기준 조회 최적화
CREATE INDEX IF NOT EXISTS idx_tickets_platform
    ON public.dts_tickets(platform);

COMMENT ON COLUMN public.dts_tickets.platform IS
    '플랫폼 구분 (MANAGER, AGENT, ...) — CI/CD 자동 연동 필드';
COMMENT ON COLUMN public.dts_tickets.error_bug IS
    'Error/Bug 문자열 — CI/CD 빌드 오류 코드 또는 버그 식별자';

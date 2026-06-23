-- ============================================================
-- 006: build_version, qa_file_path 컬럼 승격
--      extra_fields JSONB 에서 직접 컬럼으로 이전
-- ============================================================

-- 1. 컬럼 추가
ALTER TABLE public.dts_tickets
    ADD COLUMN IF NOT EXISTS build_version VARCHAR(100),
    ADD COLUMN IF NOT EXISTS qa_file_path  TEXT;

-- 2. 기존 extra_fields 데이터 직접 컬럼으로 이전
UPDATE public.dts_tickets
SET
    build_version = extra_fields->>'buildVersion',
    qa_file_path  = extra_fields->>'qaFilePath'
WHERE ticket_type = 1
  AND extra_fields IS NOT NULL;

-- 3. extra_fields 에서 이전된 키 제거
UPDATE public.dts_tickets
SET extra_fields = extra_fields
    - 'buildVersion'
    - 'qaFilePath'
WHERE ticket_type = 1
  AND extra_fields IS NOT NULL;

-- 4. 인덱스: 빌드버전 기준 조회 최적화
CREATE INDEX IF NOT EXISTS idx_tickets_build_version
    ON public.dts_tickets(build_version);

COMMENT ON COLUMN public.dts_tickets.build_version IS
    '빌드/버전 번호 — CI/CD 자동 연동 필드 (QA 오류 타입)';
COMMENT ON COLUMN public.dts_tickets.qa_file_path IS
    'ECM 업로드 경로 또는 QA 결과 파일 경로 — CI/CD 자동 연동 필드';

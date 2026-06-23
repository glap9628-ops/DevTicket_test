-- 티켓 첨부파일 경로 컬럼 추가
ALTER TABLE dts_tickets ADD COLUMN IF NOT EXISTS attachment_path TEXT;

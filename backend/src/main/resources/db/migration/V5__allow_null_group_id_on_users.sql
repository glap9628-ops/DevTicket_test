-- users.group_id: NOT NULL → NULL 허용 (부서 미배정 사용자 지원)
ALTER TABLE users ALTER COLUMN group_id DROP NOT NULL;

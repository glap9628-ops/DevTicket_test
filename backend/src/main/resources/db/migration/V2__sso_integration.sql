-- ─── V2: SSO 연동 스키마 변경 ──────────────────────────────────────────
-- 1. users.password_hash  → nullable  (SSO 사용자는 로컬 비밀번호 없음)
-- 2. users.sso_user_id    → SSO end_user_id PK 저장
-- 3. groups.sso_dept_id   → SSO department_id 매핑

-- ── users ──────────────────────────────────────────────────────────────
ALTER TABLE public.users
    ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS sso_user_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_sso_user_id
    ON public.users(sso_user_id)
    WHERE sso_user_id IS NOT NULL;

-- ── groups ─────────────────────────────────────────────────────────────
ALTER TABLE public.groups
    ADD COLUMN IF NOT EXISTS sso_dept_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_sso_dept_id
    ON public.groups(sso_dept_id)
    WHERE sso_dept_id IS NOT NULL;

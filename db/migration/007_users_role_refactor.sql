-- Migration 007: users.role 컬럼을 roles 테이블로 분리
-- - roles 테이블에 'admin' / 'user' 시스템 역할 추가
-- - users.role_id NOT NULL 화 (기존 role 컬럼 데이터 마이그레이션)
-- - users.role VARCHAR 컬럼 제거
-- - users PK 시퀀스를 1000번부터 시작 (SSO PK 충돌 방지)

-- ─── Step 1. roles 테이블에 시스템 역할 추가 ─────────────────────────
INSERT INTO public.roles (name, description, is_active, sort_order) VALUES
    ('admin', '시스템 관리자', TRUE, 0),
    ('user',  '일반 사용자',   TRUE, 1)
ON CONFLICT (name) DO NOTHING;

-- ─── Step 2. 기존 role 컬럼 값을 role_id 로 마이그레이션 ─────────────
-- users.role ('admin'|'user') → roles 테이블의 해당 id 로 매핑
UPDATE public.users u
SET role_id = r.id
FROM public.roles r
WHERE r.name = u.role;

-- role_id 가 여전히 NULL 인 경우 (혹시 누락된 경우) → 'user' 기본값
UPDATE public.users
SET role_id = (SELECT id FROM public.roles WHERE name = 'user')
WHERE role_id IS NULL;

-- ─── Step 3. role_id NOT NULL 제약 ───────────────────────────────────
ALTER TABLE public.users ALTER COLUMN role_id SET NOT NULL;

-- ─── Step 4. 기존 role VARCHAR 컬럼 제거 ─────────────────────────────
-- CHECK 제약(chk_users_role)은 컬럼 삭제 시 자동으로 함께 삭제됨
ALTER TABLE public.users DROP COLUMN role;

-- ─── Step 5. users PK 시퀀스를 1000번부터 시작 ───────────────────────
-- 현재 MAX(id) 가 999 이하면 다음 INSERT 는 1000 부터
-- 이미 1000 이상이면 기존 max+1 로 자동 유지
SELECT setval(
    'users_id_seq',
    GREATEST(999, (SELECT COALESCE(MAX(id), 0) FROM public.users))
);

-- ─── 확인 쿼리 (수동 실행용) ─────────────────────────────────────────
-- SELECT id, username, role_id, (SELECT name FROM roles WHERE id = u.role_id) AS role_name
--   FROM users u ORDER BY id;
--
-- SELECT last_value FROM users_id_seq;   -- 999 이상이어야 함

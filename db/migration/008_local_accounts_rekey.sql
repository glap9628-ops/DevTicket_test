-- Migration 008: 로컬 계정 체계 재구성
-- - roles PK를 1000번부터 시작 (SSO role과 충돌 방지)
-- - users를 로컬 전용 테이블로 전환: admin(1000), system(1001) 만 유지

-- ─── 1. 불필요한 사용자 관련 연결 데이터 먼저 정리 ──────────────────
UPDATE public.system_settings SET updated_by = NULL;

DELETE FROM public.user_app_orders
WHERE user_id NOT IN (SELECT id FROM public.users WHERE username IN ('admin', 'system'));

DELETE FROM public.app_user_access
WHERE user_id NOT IN (SELECT id FROM public.users WHERE username IN ('admin', 'system'));

DELETE FROM public.app_feature_access
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM public.users WHERE username IN ('admin', 'system'));

-- ─── 2. admin / system 계정 정보 임시 보관 ───────────────────────────
CREATE TEMP TABLE _tmp_keep_users AS
SELECT username, password_hash, display_name, email, group_id, role_id, is_active
FROM public.users
WHERE username IN ('admin', 'system');

-- ─── 3. users 전체 삭제 (CASCADE 포함) ───────────────────────────────
DELETE FROM public.users;

-- ─── 4. FK / 트리거 일시 비활성화 (ID 직접 지정 INSERT를 위해) ────────
SET session_replication_role = 'replica';

-- ─── 5. roles PK 1000번부터 재설정 ───────────────────────────────────
-- id=1(admin) → 1000, id=2(user) → 1001, 기타 커스텀 역할은 +999
UPDATE public.roles SET id = id + 999 WHERE id < 1000;

-- roles 시퀀스 재설정 (다음 INSERT → MAX+1)
SELECT setval('roles_id_seq', (SELECT MAX(id) FROM public.roles));

-- ─── 6. users 재삽입: admin=1000, system=1001 ────────────────────────
-- role_id 도 이미 +999 된 값으로 조정
INSERT INTO public.users (id, username, password_hash, display_name, email, group_id, role_id, is_active)
SELECT 1000, username, password_hash, display_name, email, group_id, role_id + 999, is_active
FROM _tmp_keep_users WHERE username = 'admin';

INSERT INTO public.users (id, username, password_hash, display_name, email, group_id, role_id, is_active)
SELECT 1001, username, password_hash, display_name, email, group_id, role_id + 999, is_active
FROM _tmp_keep_users WHERE username = 'system';

-- users 시퀀스 재설정 (다음 INSERT → 1002)
SELECT setval('users_id_seq', 1001);

-- ─── 7. FK / 트리거 복원 ─────────────────────────────────────────────
SET session_replication_role = 'origin';

DROP TABLE _tmp_keep_users;

-- ─── 확인 쿼리 ───────────────────────────────────────────────────────
-- SELECT id, username, role_id FROM public.users ORDER BY id;
--  id   | username | role_id
-- ------+----------+---------
--  1000 | admin    |    1000
--  1001 | system   |    1000

-- SELECT id, name FROM public.roles ORDER BY id;
--  id   | name
-- ------+-------
--  1000 | admin
--  1001 | user

-- SELECT last_value FROM users_id_seq;   -- 1001
-- SELECT last_value FROM roles_id_seq;   -- 1001 (또는 MAX id)

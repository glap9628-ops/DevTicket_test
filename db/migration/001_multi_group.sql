-- Migration: 사용자 멀티 부서 지원
-- 기존 운영 DB에 적용할 마이그레이션 스크립트

-- 1. user_groups 조인 테이블 생성
CREATE TABLE IF NOT EXISTS public.user_groups (
    user_id  INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, group_id)
);

-- 2. 기존 group_id 데이터를 user_groups로 마이그레이션
INSERT INTO public.user_groups (user_id, group_id)
SELECT id, group_id FROM public.users WHERE group_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. users.group_id를 nullable로 변경
ALTER TABLE public.users ALTER COLUMN group_id DROP NOT NULL;

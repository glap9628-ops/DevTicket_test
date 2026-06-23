-- 기존 데브옵스팀 → DevOps팀 이름 변경
UPDATE public.groups SET name = 'DevOps팀', description = '데브옵스 및 인프라 담당' WHERE id = 1;

-- AX컨설팅팀, AX기획팀 추가
INSERT INTO public.groups (name, description)
SELECT 'AX컨설팅팀', 'AX 컨설팅 담당'
WHERE NOT EXISTS (SELECT 1 FROM public.groups WHERE name = 'AX컨설팅팀');

INSERT INTO public.groups (name, description)
SELECT 'AX기획팀', 'AX 기획 담당'
WHERE NOT EXISTS (SELECT 1 FROM public.groups WHERE name = 'AX기획팀');

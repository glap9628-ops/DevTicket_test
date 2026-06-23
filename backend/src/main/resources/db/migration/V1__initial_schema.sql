-- ============================================================
-- V1 : 전체 스키마 (현재 상태 기준 — 모든 히스토리 마이그레이션 통합)
-- 이 파일 하나로 완전한 DevTicket + 인증 DB 스키마를 구성한다.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- ─── groups ──────────────────────────────────────────────────────
CREATE TABLE public.groups (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(500),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── roles (PK 1000번 시작 — SSO role ID 충돌 방지) ──────────────
CREATE SEQUENCE public.roles_id_seq
    START WITH 1000 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE public.roles (
    id          INTEGER NOT NULL DEFAULT nextval('public.roles_id_seq') PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL UNIQUE,
    description VARCHAR(500),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;

-- ─── positions ────────────────────────────────────────────────────
CREATE TABLE public.positions (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL UNIQUE,
    description VARCHAR(500),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── users (PK 1000번 시작 — SSO user ID 충돌 방지) ──────────────
-- role 컬럼 없음: roles 테이블의 role_id 로 통합 관리
CREATE SEQUENCE public.users_id_seq
    START WITH 1000 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE public.users (
    id            INTEGER      NOT NULL DEFAULT nextval('public.users_id_seq') PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(100) NOT NULL,
    email         VARCHAR(255),
    group_id      INTEGER      NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
    position_id   INTEGER      REFERENCES public.positions(id),
    role_id       INTEGER      NOT NULL REFERENCES public.roles(id),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    avatar_path   VARCHAR(255),
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;

CREATE INDEX idx_users_username  ON public.users(username);
CREATE INDEX idx_users_group_id  ON public.users(group_id);
CREATE INDEX idx_users_is_active ON public.users(is_active);

-- ─── user_groups (멀티 부서 지원) ─────────────────────────────────
CREATE TABLE public.user_groups (
    user_id  INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, group_id)
);

-- ─── system_settings ──────────────────────────────────────────────
CREATE TABLE public.system_settings (
    id                           SERIAL PRIMARY KEY,
    auto_logout_seconds          INTEGER NOT NULL DEFAULT 1800,
    jwt_expire_seconds           INTEGER NOT NULL DEFAULT 3600,
    jwt_refresh_interval_seconds INTEGER NOT NULL DEFAULT 600,
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by                   INTEGER REFERENCES public.users(id)
);

-- ─── user_app_orders ──────────────────────────────────────────────
CREATE TABLE public.user_app_orders (
    user_id    INTEGER PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    app_order  JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── apps ─────────────────────────────────────────────────────────
CREATE TABLE public.apps (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(50)  NOT NULL UNIQUE,
    description     VARCHAR(500),
    icon            VARCHAR(50)  NOT NULL DEFAULT 'Box',
    path            VARCHAR(255) NOT NULL,
    color           VARCHAR(20)  NOT NULL DEFAULT '#3B82F6',
    admin_path      VARCHAR(255),
    open_in_new_tab BOOLEAN NOT NULL DEFAULT TRUE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── app_group_access ─────────────────────────────────────────────
CREATE TABLE public.app_group_access (
    app_id   INTEGER NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    PRIMARY KEY (app_id, group_id)
);

-- ─── app_user_access ──────────────────────────────────────────────
CREATE TABLE public.app_user_access (
    app_id  INTEGER NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    PRIMARY KEY (app_id, user_id)
);

-- ─── app_features ─────────────────────────────────────────────────
CREATE TABLE public.app_features (
    id          SERIAL PRIMARY KEY,
    app_id      INTEGER NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(50)  NOT NULL,
    icon        VARCHAR(50),
    description VARCHAR(500),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── app_feature_access ───────────────────────────────────────────
CREATE TABLE public.app_feature_access (
    id          SERIAL PRIMARY KEY,
    feature_id  INTEGER NOT NULL REFERENCES public.app_features(id) ON DELETE CASCADE,
    group_id    INTEGER REFERENCES public.groups(id)    ON DELETE CASCADE,
    user_id     INTEGER REFERENCES public.users(id)     ON DELETE CASCADE,
    role_id     INTEGER REFERENCES public.roles(id)     ON DELETE CASCADE,
    position_id INTEGER REFERENCES public.positions(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── DevTicket 전용 테이블 ─────────────────────────────────────────
-- ticket_type : 1=QA오류, 2=데브옵스, 3=내부개발, 4=업체요청
-- status      : 1=대기, 2=진행중, 3=QA재검증중, 4=완료, 5=보류, 6=반려

CREATE SEQUENCE IF NOT EXISTS public.dts_ticket_no_seq START 1;

CREATE TABLE public.dts_tickets (
    id              BIGSERIAL    PRIMARY KEY,
    ticket_no       VARCHAR(10)  NOT NULL UNIQUE,
    ticket_type     SMALLINT     NOT NULL,
    title           VARCHAR(200) NOT NULL,
    status          SMALLINT     NOT NULL DEFAULT 1,
    is_urgent       BOOLEAN      NOT NULL DEFAULT FALSE,
    product_name    VARCHAR(50),
    platform        VARCHAR(50),
    error_bug       TEXT,
    build_version   VARCHAR(100),
    qa_file_path    TEXT,
    requester_id    INTEGER      NOT NULL,
    requester_name  VARCHAR(100) NOT NULL,
    assignee_id     INTEGER,
    assignee_name   VARCHAR(100),
    extra_fields    JSONB,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_dts_tickets_status        ON public.dts_tickets(status);
CREATE INDEX idx_dts_tickets_type          ON public.dts_tickets(ticket_type);
CREATE INDEX idx_dts_tickets_requester     ON public.dts_tickets(requester_id);
CREATE INDEX idx_dts_tickets_assignee      ON public.dts_tickets(assignee_id);
CREATE INDEX idx_dts_tickets_urgent        ON public.dts_tickets(is_urgent);
CREATE INDEX idx_dts_tickets_created       ON public.dts_tickets(created_at DESC);
CREATE INDEX idx_dts_tickets_platform      ON public.dts_tickets(platform);
CREATE INDEX idx_dts_tickets_build_version ON public.dts_tickets(build_version);

CREATE TABLE public.dts_ticket_history (
    id              BIGSERIAL    PRIMARY KEY,
    ticket_id       BIGINT       NOT NULL REFERENCES public.dts_tickets(id),
    from_status     SMALLINT,
    to_status       SMALLINT     NOT NULL,
    reason          TEXT,
    changed_by_id   INTEGER      NOT NULL,
    changed_by_name VARCHAR(100) NOT NULL,
    changed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dts_history_ticket ON public.dts_ticket_history(ticket_id);

-- watch 기능 비활성화 상태이나 테이블은 유지
CREATE TABLE public.dts_ticket_watchers (
    id          BIGSERIAL PRIMARY KEY,
    ticket_id   BIGINT      NOT NULL REFERENCES public.dts_tickets(id) ON DELETE CASCADE,
    user_id     INTEGER     NOT NULL,
    watch_type  VARCHAR(20) NOT NULL DEFAULT 'manual',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ticket_watcher UNIQUE (ticket_id, user_id)
);

CREATE INDEX idx_watchers_ticket ON public.dts_ticket_watchers(ticket_id);
CREATE INDEX idx_watchers_user   ON public.dts_ticket_watchers(user_id);

CREATE TABLE public.dts_mentions (
    id                BIGSERIAL   PRIMARY KEY,
    ticket_id         BIGINT      NOT NULL REFERENCES public.dts_tickets(id) ON DELETE CASCADE,
    source_type       VARCHAR(20) NOT NULL,
    source_id         BIGINT,
    mentioned_user_id INTEGER     NOT NULL,
    mentioned_by      INTEGER     NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mentions_ticket ON public.dts_mentions(ticket_id);
CREATE INDEX idx_mentions_user   ON public.dts_mentions(mentioned_user_id);

CREATE TABLE public.dts_comments (
    id          BIGSERIAL   PRIMARY KEY,
    ticket_id   BIGINT      NOT NULL REFERENCES public.dts_tickets(id) ON DELETE CASCADE,
    author_id   INTEGER     NOT NULL,
    content     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ
);

CREATE INDEX idx_comments_ticket ON public.dts_comments(ticket_id);

CREATE TABLE public.dts_notifications (
    id           BIGSERIAL   PRIMARY KEY,
    recipient_id INTEGER     NOT NULL,
    actor_id     INTEGER,
    ticket_id    BIGINT      NOT NULL REFERENCES public.dts_tickets(id) ON DELETE CASCADE,
    type         VARCHAR(30) NOT NULL,
    message      TEXT        NOT NULL,
    is_read      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON public.dts_notifications(recipient_id, is_read);

CREATE TABLE public.user_notification_settings (
    user_id           INTEGER PRIMARY KEY,
    email_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    slack_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    slack_webhook     TEXT,
    notify_on_mention BOOLEAN NOT NULL DEFAULT TRUE,
    notify_on_status  BOOLEAN NOT NULL DEFAULT TRUE,
    notify_on_comment BOOLEAN NOT NULL DEFAULT TRUE
);

-- ─── 시드 데이터 ───────────────────────────────────────────────────

-- 팀(부서)
INSERT INTO public.groups (name, description) VALUES
    ('DevOps팀',     '데브옵스 및 인프라 담당'),
    ('기술연구소팀', '기술 연구 및 내부 개발 담당'),
    ('QA팀',         'QA 및 품질 검증 담당'),
    ('영업팀',       '영업 및 업체 요청 담당'),
    ('AX컨설팅팀',   'AX 컨설팅 담당'),
    ('AX기획팀',     'AX 기획 담당');

-- 시스템 역할 (id: 1000=admin, 1001=user)
INSERT INTO public.roles (id, name, description, is_active, sort_order) VALUES
    (1000, 'admin', '시스템 관리자', TRUE, 0),
    (1001, 'user',  '일반 사용자',   TRUE, 1);
SELECT setval('public.roles_id_seq', 1001);

-- 시스템 설정
INSERT INTO public.system_settings (auto_logout_seconds, jwt_expire_seconds, jwt_refresh_interval_seconds)
VALUES (1800, 3600, 600);

-- DevTicket 앱 등록
INSERT INTO public.apps (name, slug, description, icon, path, color, open_in_new_tab, is_active, sort_order)
VALUES ('DevTicket', 'devticket', '개발 요청 관리 시스템', 'Ticket', '/devticket/', '#3B82F6', FALSE, TRUE, 0);

-- 로컬 계정 (id: 1000=관리자, 1001=system)
-- ⚠ system 비밀번호는 운영 배포 전 반드시 변경할 것
INSERT INTO public.users (id, username, password_hash, display_name, group_id, role_id, is_active) VALUES
    (1000, 'admin',  crypt('admin1234', gen_salt('bf', 12)), '관리자',         1, 1000, TRUE),
    (1001, 'system', crypt('CHANGE_ME', gen_salt('bf', 12)), 'System Account', 1, 1000, TRUE);
SELECT setval('public.users_id_seq', 1001);

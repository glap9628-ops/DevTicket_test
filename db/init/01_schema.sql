-- ============================================================
-- DevTicket System - Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- ─── Auth 서비스 테이블 (innoRelease auth 서비스와 동일) ──────────

CREATE TABLE public.groups (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(500),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(500),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.positions (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(500),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(100) NOT NULL,
    email         VARCHAR(255),
    role          VARCHAR(20)  NOT NULL DEFAULT 'user'
                  CONSTRAINT chk_users_role CHECK (role IN ('admin', 'user')),
    group_id      INTEGER NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
    position_id   INTEGER REFERENCES public.positions(id),
    role_id       INTEGER REFERENCES public.roles(id),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    avatar_path   VARCHAR(255),
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username  ON public.users(username);
CREATE INDEX idx_users_group_id  ON public.users(group_id);
CREATE INDEX idx_users_is_active ON public.users(is_active);

CREATE TABLE public.system_settings (
    id                           SERIAL PRIMARY KEY,
    auto_logout_seconds          INTEGER NOT NULL DEFAULT 1800,
    jwt_expire_seconds           INTEGER NOT NULL DEFAULT 3600,
    jwt_refresh_interval_seconds INTEGER NOT NULL DEFAULT 600,
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by                   INTEGER REFERENCES public.users(id)
);

CREATE TABLE public.user_app_orders (
    user_id    INTEGER PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    app_order  JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE public.app_group_access (
    app_id   INTEGER NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    PRIMARY KEY (app_id, group_id)
);

CREATE TABLE public.app_user_access (
    app_id  INTEGER NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    PRIMARY KEY (app_id, user_id)
);

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

CREATE TABLE public.app_feature_access (
    id          SERIAL PRIMARY KEY,
    feature_id  INTEGER NOT NULL REFERENCES public.app_features(id) ON DELETE CASCADE,
    group_id    INTEGER REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id     INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
    role_id     INTEGER REFERENCES public.roles(id) ON DELETE CASCADE,
    position_id INTEGER REFERENCES public.positions(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── DevTicket 전용 테이블 ────────────────────────────────────────

-- ticket_type:  1=QA오류, 2=데브옵스, 3=내부개발, 4=업체요청
-- status:       1=대기, 2=진행중, 3=QA재검증중, 4=완료, 5=보류, 6=반려

CREATE SEQUENCE IF NOT EXISTS dts_ticket_no_seq START 1;

CREATE TABLE public.dts_tickets (
    id              BIGSERIAL PRIMARY KEY,
    ticket_no       VARCHAR(10)  NOT NULL UNIQUE,
    ticket_type     SMALLINT     NOT NULL,
    title           VARCHAR(200) NOT NULL,
    status          SMALLINT     NOT NULL DEFAULT 1,
    is_urgent       BOOLEAN      NOT NULL DEFAULT FALSE,
    product_name    VARCHAR(50),
    requester_id    INTEGER      NOT NULL,
    requester_name  VARCHAR(100) NOT NULL,
    assignee_id     INTEGER,
    assignee_name   VARCHAR(100),
    extra_fields    JSONB,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_dts_tickets_status    ON public.dts_tickets(status);
CREATE INDEX idx_dts_tickets_type      ON public.dts_tickets(ticket_type);
CREATE INDEX idx_dts_tickets_requester ON public.dts_tickets(requester_id);
CREATE INDEX idx_dts_tickets_assignee  ON public.dts_tickets(assignee_id);
CREATE INDEX idx_dts_tickets_urgent    ON public.dts_tickets(is_urgent);
CREATE INDEX idx_dts_tickets_created   ON public.dts_tickets(created_at DESC);

CREATE TABLE public.dts_ticket_history (
    id              BIGSERIAL PRIMARY KEY,
    ticket_id       BIGINT       NOT NULL REFERENCES public.dts_tickets(id),
    from_status     SMALLINT,
    to_status       SMALLINT     NOT NULL,
    reason          TEXT,
    changed_by_id   INTEGER      NOT NULL,
    changed_by_name VARCHAR(100) NOT NULL,
    changed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dts_history_ticket ON public.dts_ticket_history(ticket_id);

-- ─── 시드 데이터 ──────────────────────────────────────────────────

-- 팀(부서): 1=DevOps팀, 2=기술연구소팀, 3=QA팀, 4=영업팀, 5=AX컨설팅팀, 6=AX기획팀
-- 관리자 권한은 users.role = 'admin' 으로 별도 관리 (어느 팀이든 부여 가능)
INSERT INTO public.groups (name, description) VALUES
    ('DevOps팀',     '데브옵스 및 인프라 담당'),
    ('기술연구소팀', '기술 연구 및 내부 개발 담당'),
    ('QA팀',         'QA 및 품질 검증 담당'),
    ('영업팀',       '영업 및 업체 요청 담당'),
    ('AX컨설팅팀',   'AX 컨설팅 담당'),
    ('AX기획팀',     'AX 기획 담당');

-- 시스템 설정
INSERT INTO public.system_settings (auto_logout_seconds, jwt_expire_seconds, jwt_refresh_interval_seconds)
VALUES (1800, 3600, 600);

-- devTicket 앱 등록
INSERT INTO public.apps (name, slug, description, icon, path, color, open_in_new_tab, is_active, sort_order)
VALUES ('DevTicket', 'devticket', '개발 요청 관리 시스템', 'Ticket', '/devticket/', '#3B82F6', FALSE, TRUE, 0);

-- 초기 관리자 계정 (비밀번호: admin1234)
INSERT INTO public.users (username, password_hash, display_name, role, group_id)
VALUES (
    'admin',
    crypt('admin1234', gen_salt('bf', 12)),
    '관리자',
    'admin',
    1
);

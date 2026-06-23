-- ============================================================
-- 004: 댓글 + 알림 + 알림설정 테이블
-- ============================================================

-- 댓글
CREATE TABLE IF NOT EXISTS public.dts_comments (
    id          BIGSERIAL PRIMARY KEY,
    ticket_id   BIGINT      NOT NULL REFERENCES public.dts_tickets(id) ON DELETE CASCADE,
    author_id   INTEGER     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_comments_ticket ON public.dts_comments(ticket_id);

-- 알림
CREATE TABLE IF NOT EXISTS public.dts_notifications (
    id           BIGSERIAL PRIMARY KEY,
    recipient_id INTEGER     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    actor_id     INTEGER     REFERENCES public.users(id) ON DELETE SET NULL,
    ticket_id    BIGINT      NOT NULL REFERENCES public.dts_tickets(id) ON DELETE CASCADE,
    type         VARCHAR(30) NOT NULL,
    message      TEXT        NOT NULL,
    is_read      BOOLEAN     NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.dts_notifications(recipient_id, is_read);

-- 사용자별 알림 설정
CREATE TABLE IF NOT EXISTS public.user_notification_settings (
    user_id             INTEGER PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    email_enabled       BOOLEAN NOT NULL DEFAULT false,
    slack_enabled       BOOLEAN NOT NULL DEFAULT false,
    slack_webhook       TEXT,
    notify_on_mention   BOOLEAN NOT NULL DEFAULT true,
    notify_on_status    BOOLEAN NOT NULL DEFAULT true,
    notify_on_comment   BOOLEAN NOT NULL DEFAULT true
);

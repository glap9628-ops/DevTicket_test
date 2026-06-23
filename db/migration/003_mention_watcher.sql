-- ============================================================
-- Migration 003: 멘션 & 워처 기능
-- ============================================================

-- ─── 워처 테이블 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dts_ticket_watchers (
    id          BIGSERIAL PRIMARY KEY,
    ticket_id   BIGINT  NOT NULL REFERENCES public.dts_tickets(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    watch_type  VARCHAR(20) NOT NULL DEFAULT 'manual',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_ticket_watcher UNIQUE (ticket_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_watchers_ticket ON public.dts_ticket_watchers(ticket_id);
CREATE INDEX IF NOT EXISTS idx_watchers_user   ON public.dts_ticket_watchers(user_id);

COMMENT ON COLUMN public.dts_ticket_watchers.watch_type IS
  'manual: 직접 구독, auto_requester: 등록자 자동, auto_assignee: 담당자 자동, auto_mention: 멘션으로 자동';

-- ─── 멘션 테이블 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dts_mentions (
    id                BIGSERIAL PRIMARY KEY,
    ticket_id         BIGINT  NOT NULL REFERENCES public.dts_tickets(id) ON DELETE CASCADE,
    source_type       VARCHAR(20) NOT NULL,
    source_id         BIGINT,
    mentioned_user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    mentioned_by      INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mentions_ticket ON public.dts_mentions(ticket_id);
CREATE INDEX IF NOT EXISTS idx_mentions_user   ON public.dts_mentions(mentioned_user_id);

COMMENT ON COLUMN public.dts_mentions.source_type IS
  'ticket_description: 티켓 본문, comment: 댓글, status_reason: 상태변경 사유';
COMMENT ON COLUMN public.dts_mentions.source_id IS
  'source_type이 comment인 경우 댓글 ID, 그 외에는 NULL';


-- =====================================================
-- FAMILY HUB — MIGRATION 003
-- Приглашения в финансовые пространства
-- =====================================================

BEGIN;

CREATE TABLE workspace_invitations (

    -- Уникальный ID приглашения.
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Пространство, куда приглашают пользователя.
    workspace_id BIGINT NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    -- Email приглашённого пользователя.
    invited_email TEXT NOT NULL,

    -- Пользователь, отправивший приглашение.
    invited_by BIGINT NOT NULL
        REFERENCES users(id),

    -- Состояние приглашения.
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined')),

    -- Дата создания.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Проверяем, что email не пустой.
    CONSTRAINT invitation_email_not_empty
        CHECK (length(trim(invited_email)) > 0),

    -- Храним email в нормализованном виде.
    CONSTRAINT invitation_email_normalized
        CHECK (invited_email = lower(trim(invited_email)))
);

-- Нельзя иметь два активных приглашения
-- одного email в одно и то же пространство.
CREATE UNIQUE INDEX workspace_invitations_pending_unique
ON workspace_invitations (workspace_id, invited_email)
WHERE status = 'pending';

-- Ускоряем поиск приглашений по email.
CREATE INDEX workspace_invitations_email_idx
ON workspace_invitations (invited_email)
WHERE status = 'pending';

COMMIT;

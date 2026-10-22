
-- =====================================================
-- FAMILY HUB — MIGRATION 002
-- Google accounts and shared workspaces
-- =====================================================

-- Все изменения выполняются одной транзакцией.
-- Если произойдёт ошибка, изменения можно откатить.
BEGIN;


-- =====================================================
-- 1. USERS
-- =====================================================

-- Пользователь Family Hub.
-- Он может участвовать в нескольких пространствах.
CREATE TABLE users (

    -- Внутренний уникальный идентификатор.
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Email пользователя.
    -- Нормализацию выполняет backend.
    email TEXT NOT NULL UNIQUE,

    -- Имя для отображения в приложении.
    display_name TEXT NOT NULL,

    -- Когда аккаунт был создан.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Запрещаем пустые email и имена.
    CONSTRAINT users_email_not_empty
        CHECK (length(trim(email)) > 0),

    CONSTRAINT users_name_not_empty
        CHECK (length(trim(display_name)) > 0)
);


-- =====================================================
-- 2. USER_AUTH_PROVIDERS
-- =====================================================

-- Хранит связь пользователя Family Hub
-- с внешним сервисом авторизации, например Google.
CREATE TABLE user_auth_providers (

    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- К какому пользователю Family Hub относится вход.
    user_id BIGINT NOT NULL REFERENCES users(id)
        ON DELETE CASCADE,

    -- Название провайдера авторизации.
    -- Пока используем только Google.
    provider TEXT NOT NULL,

    -- Уникальный ID аккаунта у провайдера.
    -- Для Google это значение поля "sub".
    -- Не путать с email: email может измениться.
    provider_user_id TEXT NOT NULL,

    -- Один Google-аккаунт не должен быть
    -- привязан к нескольким пользователям Family Hub.
    CONSTRAINT auth_provider_unique
        UNIQUE (provider, provider_user_id),

    -- Один пользователь пока имеет не более
    -- одной привязки к конкретному провайдеру.
    CONSTRAINT user_provider_unique
        UNIQUE (user_id, provider)
);



-- =====================================================
-- 3. WORKSPACES — ФИНАНСОВЫЕ ПРОСТРАНСТВА
-- =====================================================

-- Workspace — независимое пространство для учёта денег.
--
-- Например:
-- 1. "Наша семья"
-- 2. "Мотосервис"
-- 3. "Beauty Studio"
--
-- У каждого пространства будут свои категории
-- и финансовые операции.

CREATE TABLE workspaces (

    -- Уникальный идентификатор пространства.
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Название пространства.
    name TEXT NOT NULL,

    -- Пользователь, который создал пространство.
    -- Ссылается на таблицу users.
    created_by BIGINT NOT NULL REFERENCES users(id),

    -- Время создания пространства.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Название не может состоять только из пробелов.
    CONSTRAINT workspaces_name_not_empty
        CHECK (length(trim(name)) > 0)
);


-- =====================================================
-- 4. WORKSPACE_MEMBERS — УЧАСТНИКИ ПРОСТРАНСТВ
-- =====================================================

-- Соединяет пользователей и пространства.
--
-- Например:
-- user_id = 1, workspace_id = 1
-- user_id = 2, workspace_id = 1
--
-- Получается, что два пользователя имеют доступ
-- к одному общему пространству.

CREATE TABLE workspace_members (

    -- Пространство, к которому относится участник.
    workspace_id BIGINT NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    -- Пользователь, которому предоставлен доступ.
    user_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    -- Время вступления пользователя в пространство.
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Составной первичный ключ.
    --
    -- Не позволяет добавить одного пользователя
    -- в одно и то же пространство дважды.
    --
    -- Но пользователь может состоять
    -- в нескольких разных пространствах.
    PRIMARY KEY (workspace_id, user_id)
);

-- Ускоряет поиск всех пространств,
-- к которым имеет доступ конкретный пользователь.
CREATE INDEX workspace_members_user_id_idx
    ON workspace_members(user_id);




-- =====================================================
-- 5. CATEGORIES — КАТЕГОРИИ ПРОСТРАНСТВА
-- =====================================================

-- Каждая категория принадлежит одному пространству.
-- Так как таблица categories пустая,
-- мы можем сразу использовать NOT NULL.

ALTER TABLE categories
ADD COLUMN workspace_id BIGINT NOT NULL
    REFERENCES workspaces(id);

-- Удаляем старую глобальную уникальность категорий.
-- Теперь одинаковые категории смогут существовать
-- в разных финансовых пространствах.
ALTER TABLE categories
DROP CONSTRAINT categories_name_type_unique;

-- Теперь уникальность действует внутри пространства.
ALTER TABLE categories
ADD CONSTRAINT categories_workspace_name_type_unique
UNIQUE (workspace_id, name, type);

-- Этот ключ также позволит проверять, что категория
-- и транзакция принадлежат одному пространству.
ALTER TABLE categories
ADD CONSTRAINT categories_id_workspace_unique
UNIQUE (id, workspace_id);


-- =====================================================
-- 6. TRANSACTIONS — ОПЕРАЦИИ ПРОСТРАНСТВА
-- =====================================================

-- Каждая операция обязательно относится
-- к определённому пространству.
ALTER TABLE transactions
ADD COLUMN workspace_id BIGINT NOT NULL
    REFERENCES workspaces(id);

-- Сохраняем автора операции.
ALTER TABLE transactions
ADD COLUMN created_by BIGINT NOT NULL
    REFERENCES users(id);

-- Не разрешаем привязать транзакцию одного
-- пространства к категории другого пространства.
ALTER TABLE transactions
ADD CONSTRAINT transactions_category_workspace_fk
FOREIGN KEY (category_id, workspace_id)
REFERENCES categories(id, workspace_id);

-- Ускоряем поиск операций конкретного пространства.
CREATE INDEX transactions_workspace_id_idx
    ON transactions(workspace_id);

-- Завершаем всю SQL-транзакцию миграции.
COMMIT;
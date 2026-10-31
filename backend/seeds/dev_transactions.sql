
-- ==========================================================
-- FAMILY HUB — ПОСТОЯННЫЕ ТЕСТОВЫЕ ДАННЫЕ
-- ==========================================================
--
-- База: family_hub_dev
-- Пространство: Family Hub Demo [seed]
-- Владелец: пользователь ID 1
-- Период: май — октябрь 2026
-- Количество: 60 операций (10 в каждом месяце)
--
-- Повторный запуск не создаёт дубликаты.
-- Обычные финансовые пространства не изменяем.
-- ==========================================================

BEGIN;

DO $$
DECLARE
    v_owner_id BIGINT := 1;
    v_workspace_id BIGINT;
    v_category_id BIGINT;
    v_transaction RECORD;
BEGIN

    -- ------------------------------------------------------
    -- 1. ЗАЩИТА ОТ ЗАПУСКА В ОСНОВНОЙ БАЗЕ
    -- ------------------------------------------------------

    IF current_database() <> 'family_hub_dev' THEN
        RAISE EXCEPTION
            'Seed разрешён только в family_hub_dev';
    END IF;

    -- Не запускаем два одинаковых seed одновременно.
    PERFORM pg_advisory_xact_lock(9298, 2026);

    -- Проверяем, что владелец существует.
    IF NOT EXISTS (
        SELECT 1 FROM users WHERE id = v_owner_id
    ) THEN
        RAISE EXCEPTION
            'Пользователь с ID % не найден', v_owner_id;
    END IF;

    -- ------------------------------------------------------
    -- 2. СОЗДАЁМ ОТДЕЛЬНОЕ ТЕСТОВОЕ ПРОСТРАНСТВО
    -- ------------------------------------------------------

    SELECT id
    INTO v_workspace_id
    FROM workspaces
    WHERE name = 'Family Hub Demo [seed]'
      AND created_by = v_owner_id
    ORDER BY id
    LIMIT 1
    FOR UPDATE;

    IF v_workspace_id IS NULL THEN

        INSERT INTO workspaces (name, created_by)
        VALUES ('Family Hub Demo [seed]', v_owner_id)
        RETURNING id INTO v_workspace_id;

    END IF;

    -- Добавляем владельца в участники.
    INSERT INTO workspace_members (workspace_id, user_id)
    VALUES (v_workspace_id, v_owner_id)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

    -- ------------------------------------------------------
    -- 3. СОЗДАЁМ 60 ОПЕРАЦИЙ ЗА 6 МЕСЯЦЕВ
    -- ------------------------------------------------------
    --
    -- Для каждого месяца добавляем:
    --
    -- 2 дохода:
    --   Зарплата, Подработка
    --
    -- 8 расходов:
    --   Аренда, Продукты, Коммуналка, Топливо,
    --   Ресторан, Интернет, Транспорт, Развлечения
    --
    -- Суммы немного отличаются от месяца к месяцу.
    -- ------------------------------------------------------

    FOR v_transaction IN

        SELECT
            (
                DATE '2026-05-01'
                + (month_number * INTERVAL '1 month')
            )::DATE + operation.day_number AS operation_date,

            operation.description AS description,

            operation.type AS type,

            operation.category AS category,

            ROUND(
                (
                    operation.base_amount
                    + month_number * operation.monthly_change
                )::NUMERIC,
                2
            ) AS amount

        FROM generate_series(0, 5) AS month_number

        CROSS JOIN (
            VALUES

            -- День, описание, тип, категория, сумма, изменение

            (1,  'Зарплата',
                 'income', 'зарплата', 1850.00, 45.00),

            (8,  'Подработка',
                 'income', 'подработка', 180.00, 25.00),

            (2,  'Аренда квартиры',
                 'expense', 'жильё', 620.00, 0.00),

            (5,  'Продукты Lidl',
                 'expense', 'еда', 85.40, 5.75),

            (10, 'Коммунальные услуги',
                 'expense', 'коммуналка', 110.00, 8.50),

            (12, 'Заправка автомобиля',
                 'expense', 'топливо', 65.50, 6.20),

            (15, 'Ужин в ресторане',
                 'expense', 'ресторан', 42.00, 3.80),

            (18, 'Домашний интернет',
                 'expense', 'интернет', 25.00, 0.00),

            (21, 'Общественный транспорт',
                 'expense', 'транспорт', 30.00, 2.50),

            (25, 'Кино и развлечения',
                 'expense', 'развлечения', 38.00, 4.00)

        ) AS operation(
            day_number,
            description,
            type,
            category,
            base_amount,
            monthly_change
        )

    LOOP

        -- ----------------------------------------------
        -- 4. СОЗДАЁМ КАТЕГОРИЮ ПРИ НЕОБХОДИМОСТИ
        -- ----------------------------------------------

        INSERT INTO categories (
            name,
            type,
            workspace_id
        )
        VALUES (
            v_transaction.category,
            v_transaction.type,
            v_workspace_id
        )
        ON CONFLICT (workspace_id, name, type)
        DO NOTHING;

        SELECT id
        INTO v_category_id
        FROM categories
        WHERE workspace_id = v_workspace_id
          AND name = v_transaction.category
          AND type = v_transaction.type;

        -- ----------------------------------------------
        -- 5. ДОБАВЛЯЕМ ОПЕРАЦИЮ БЕЗ ДУБЛИКАТОВ
        -- ----------------------------------------------

        INSERT INTO transactions (
            date,
            description,
            amount,
            type,
            category_id,
            workspace_id,
            created_by
        )

        SELECT
            v_transaction.operation_date,
            v_transaction.description,
            v_transaction.amount,
            v_transaction.type,
            v_category_id,
            v_workspace_id,
            v_owner_id

        WHERE NOT EXISTS (
            SELECT 1
            FROM transactions
            WHERE workspace_id = v_workspace_id
              AND date = v_transaction.operation_date
              AND description = v_transaction.description
              AND type = v_transaction.type
        );

    END LOOP;

    RAISE NOTICE
        'Тестовое пространство ID: %', v_workspace_id;

END $$;

COMMIT;

-- Итоговая проверка количества тестовых операций.
SELECT
    w.name AS workspace,
    COUNT(t.id) AS transactions_count
FROM workspaces w
LEFT JOIN transactions t ON t.workspace_id = w.id
WHERE w.name = 'Family Hub Demo [seed]'
  AND w.created_by = 1
GROUP BY w.id, w.name;

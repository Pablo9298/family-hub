
/*
 * FAMILY HUB — WORKSPACE ROUTES
 *
 * Workspace — отдельное финансовое пространство.
 *
 * Примеры:
 * - Наша семья
 * - Мотосервис
 * - Beauty Studio
 *
 * В этом файле будут API-маршруты для создания
 * и управления пространствами.
 */

const express = require('express');

// Наше существующее подключение к PostgreSQL.
const pool = require('./db');

// Middleware, который проверяет вход пользователя.
const requireAuth = require('./middleware/requireAuth');

// Создаём отдельный Router.
const router = express.Router();

// Проверяет, состоит ли пользователь
// в финансовом пространстве.
const requireWorkspace = require('./middleware/requireWorkspace');


// =====================================================
// ЗАЩИТА ВСЕХ МАРШРУТОВ
// =====================================================

// Теперь каждый маршрут в этом файле требует входа.
//
// Например:
// GET /workspaces
// POST /workspaces
//
// Без авторизации сервер возвращает HTTP 401.
router.use(requireAuth);


// =====================================================
// POST /workspaces — СОЗДАНИЕ ПРОСТРАНСТВА
// =====================================================

router.post('/', async (req, res) => {

    // Название присылает frontend через JSON.
    const { name } = req.body ?? {};

    // Проверяем тип и содержимое названия.
    if (
        typeof name !== 'string' ||
        name.trim().length === 0 ||
        name.trim().length > 100
    ) {
        return res.status(400).json({
            error: 'Workspace name must contain 1–100 characters'
        });
    }

    // ID пользователя берём ИЗ СЕССИИ,
    // а не из req.body!
    //
    // Иначе пользователь мог бы отправить
    // чужой userId и создать пространство
    // от имени другого человека.
    const userId = req.session.userId;

    // Получаем отдельное соединение из пула.
    const db = await pool.connect();

    try {
        // Начинаем SQL-транзакцию.
        await db.query('BEGIN');

        // 1. Создаём новое пространство.
        const result = await db.query(
            `
            INSERT INTO workspaces (name, created_by)
            VALUES ($1, $2)
            RETURNING id, name, created_by, created_at
            `,
            [name.trim(), userId]
        );

        const workspace = result.rows[0];

        // 2. Автоматически добавляем создателя
        // в число участников пространства.
        //
        // Это важно: созданное пространство
        // сразу должно быть доступно его владельцу.
        await db.query(
            `
            INSERT INTO workspace_members
                (workspace_id, user_id)
            VALUES ($1, $2)
            `,
            [workspace.id, userId]
        );

        // Если оба запроса успешны,
        // сохраняем транзакцию.
        await db.query('COMMIT');

        // HTTP 201 означает, что ресурс создан.
        res.status(201).json({
            id: Number(workspace.id),
            name: workspace.name,
            created_by: Number(workspace.created_by),
            created_at: workspace.created_at
        });

    } catch (error) {

        // Если возникла ошибка,
        // отменяем обе SQL-операции.
        await db.query('ROLLBACK');

        console.error('Create workspace error:', error);

        res.status(500).json({
            error: 'Failed to create workspace'
        });

    } finally {

        // Обязательно освобождаем соединение,
        // чтобы другие запросы могли использовать его.
        db.release();
    }
});


/*
 * =====================================================
 * GET /workspaces — СПИСОК ПРОСТРАНСТВ ПОЛЬЗОВАТЕЛЯ
 * =====================================================
 *
 * Возвращаем только те пространства,
 * в которых текущий пользователь является участником.
 *
 * Например:
 * - У тебя может быть "Наша семья".
 * - У брата — "Мотосервис".
 * - У знакомых — "Beauty Studio".
 *
 * Каждый получит только свои пространства.
 */

router.get('/', async (req, res) => {

    // Получаем ID из серверной сессии.
    // Не принимаем userId от frontend.
    const userId = req.session.userId;

    try {
        const result = await pool.query(
            `
            SELECT
                w.id,
                w.name,
                w.created_by,
                w.created_at
            FROM workspaces w

            -- INNER JOIN оставляет только пространства,
            -- для которых есть запись об участии.
            INNER JOIN workspace_members wm
                ON wm.workspace_id = w.id

            -- Фильтруем по текущему пользователю.
            WHERE wm.user_id = $1

            -- Новые пространства отображаем первыми.
            ORDER BY w.created_at DESC, w.id DESC
            `,
            [userId]
        );

        // PostgreSQL возвращает BIGINT как строку.
        // Для наших небольших ID преобразуем их в Number.
        const workspaces = result.rows.map(workspace => ({
            id: Number(workspace.id),
            name: workspace.name,
            created_by: Number(workspace.created_by),
            created_at: workspace.created_at
        }));

        res.json(workspaces);

    } catch (error) {
        console.error('Get workspaces error:', error);

        res.status(500).json({
            error: 'Failed to load workspaces'
        });
    }
});


/*
 * =====================================================
 * GET /workspaces/:workspaceId/categories
 * =====================================================
 *
 * Возвращает категории одного пространства.
 *
 * Например:
 * GET /workspaces/1/categories
 *
 * Сначала requireAuth проверяет вход пользователя
 * (он уже подключён через router.use).
 *
 * Затем requireWorkspace проверяет,
 * что пользователь состоит в пространстве №1.
 */

router.get(
    '/:workspaceId/categories',
    requireWorkspace,
    async (req, res) => {

        // Это ID пространства, которое уже проверил
        // наш middleware requireWorkspace.
        const workspaceId = req.workspaceId;

        try {
            // Выбираем категории только данного бюджета.
            //
            // $1 — параметр SQL-запроса.
            // Вместо него PostgreSQL безопасно
            // подставит workspaceId.
            const result = await pool.query(
                `
                SELECT
                    id,
                    name,
                    type
                FROM categories
                WHERE workspace_id = $1
                ORDER BY type, name
                `,
                [workspaceId]
            );

            // PostgreSQL возвращает BIGINT как строку,
            // поэтому преобразуем ID в число.
            const categories = result.rows.map(category => ({
                id: Number(category.id),
                name: category.name,
                type: category.type
            }));

            // Отправляем список категорий во frontend.
            res.json(categories);

        } catch (error) {
            console.error('Get workspace categories error:', error);

            res.status(500).json({
                error: 'Failed to load categories'
            });
        }
    }
);



module.exports = router;

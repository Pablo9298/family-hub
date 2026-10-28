
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

// Проверяет, что пользователь — создатель пространства.
const requireWorkspaceOwner =
    require('./middleware/requireWorkspaceOwner');


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
 * GET /workspaces/:workspaceId/members
 * =====================================================
 *
 * Возвращает участников выбранного пространства.
 *
 * Доступ:
 * - владелец пространства;
 * - любой участник пространства.
 *
 * Чужие пользователи не смогут получить список,
 * потому что requireWorkspace проверяет членство.
 */

router.get(
    '/:workspaceId/members',
    requireWorkspace,
    async (req, res) => {

        // Получаем ID пространства, которое уже
        // проверил middleware requireWorkspace.
        const workspaceId = req.workspaceId;

        try {

            const result = await pool.query(
                `
                SELECT
                    u.id,
                    u.display_name,
                    u.email,

                    CASE
                        WHEN w.created_by = u.id
                            THEN 'owner'
                        ELSE 'member'
                    END AS role

                FROM workspace_members wm

                INNER JOIN users u
                    ON u.id = wm.user_id

                INNER JOIN workspaces w
                    ON w.id = wm.workspace_id

                WHERE wm.workspace_id = $1

                ORDER BY
                    CASE
                        WHEN w.created_by = u.id THEN 0
                        ELSE 1
                    END,
                    u.display_name ASC,
                    u.id ASC
                `,
                [workspaceId]
            );

            // Преобразуем BIGINT ID из PostgreSQL.
            const members = result.rows.map(member => ({
                id: Number(member.id),
                display_name: member.display_name,
                email: member.email,
                role: member.role
            }));

            return res.json(members);

        } catch (error) {

            console.error(
                'Failed to load workspace members:',
                error
            );

            return res.status(500).json({
                error: 'Failed to load workspace members'
            });
        }
    }
);


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


/*
 * =====================================================
 * POST /workspaces/:workspaceId/invitations
 * =====================================================
 *
 * Создаёт приглашение в финансовое пространство.
 *
 * Только владелец пространства может приглашать
 * новых участников.
 *
 * Пример запроса:
 * {
 *     "email": "wife@example.com"
 * }
 *
 * Приглашение пока не предоставляет доступ.
 * Пользователь должен будет принять его отдельно.
 */

router.post(
    '/:workspaceId/invitations',
    requireWorkspaceOwner,
    async (req, res) => {

        // Получаем email из запроса.
        const { email } = req.body ?? {};

        // Проверяем, что email передан строкой.
        if (typeof email !== 'string') {
            return res.status(400).json({
                error: 'Email is required'
            });
        }

        // Приводим email к единому формату.
        // Это соответствует ограничению в нашей таблице.
        const normalizedEmail = email.trim().toLowerCase();

        // Проверяем базовый формат и длину email.
        // Это не полная проверка всех допустимых email,
        // но для нашего MVP её достаточно.
        if (
            normalizedEmail.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ) {
            return res.status(400).json({
                error: 'Invalid email address'
            });
        }

        try {

            // Проверяем, что пользователь не пытается
            // пригласить самого себя.
            const currentUser = await pool.query(
                `
                SELECT email
                FROM users
                WHERE id = $1
                `,
                [req.session.userId]
            );

            if (
                currentUser.rows[0]?.email.toLowerCase() ===
                normalizedEmail
            ) {
                return res.status(400).json({
                    error: 'You cannot invite yourself'
                });
            }

            // Если пользователь уже зарегистрирован,
            // проверяем, не состоит ли он в пространстве.
            const existingMember = await pool.query(
                `
                SELECT 1
                FROM users u
                INNER JOIN workspace_members wm
                    ON wm.user_id = u.id
                WHERE wm.workspace_id = $1
                  AND lower(u.email) = $2
                `,
                [req.workspaceId, normalizedEmail]
            );

            if (existingMember.rows.length > 0) {
                return res.status(409).json({
                    error: 'User is already a workspace member'
                });
            }

            // Создаём ожидающее приглашение.
            const result = await pool.query(
                `
                INSERT INTO workspace_invitations
                    (workspace_id, invited_email, invited_by)
                VALUES ($1, $2, $3)
                RETURNING
                    id,
                    workspace_id,
                    invited_email,
                    status,
                    created_at
                `,
                [
                    req.workspaceId,
                    normalizedEmail,
                    req.session.userId
                ]
            );

            const invitation = result.rows[0];

            return res.status(201).json({
                id: String(invitation.id),
                workspace_id: String(invitation.workspace_id),
                invited_email: invitation.invited_email,
                status: invitation.status,
                created_at: invitation.created_at
            });

        } catch (error) {

            // PostgreSQL: нарушение уникального индекса.
            // Значит, активное приглашение уже существует.
            if (error.code === '23505') {
                return res.status(409).json({
                    error: 'Pending invitation already exists'
                });
            }

            console.error('Create invitation error:', error);

            return res.status(500).json({
                error: 'Failed to create invitation'
            });
        }
    }
);


/*
 * =====================================================
 * DELETE /workspaces/:workspaceId/members/:userId
 * =====================================================
 *
 * Удаление участника финансового пространства.
 *
 * Правила:
 * 1. Только владелец может удалять участников.
 * 2. Владельца удалить нельзя.
 * 3. Удаляем только из выбранного пространства.
 * 4. Аккаунт пользователя не удаляется.
 */

router.delete(
    '/:workspaceId/members/:userId',
    requireWorkspaceOwner,
    async (req, res) => {

        // ID участника, которого хотим удалить.
        const memberId = req.params.userId;

        // Проверяем формат ID.
        if (!/^[1-9]\d*$/.test(String(memberId))) {
            return res.status(400).json({
                error: 'Invalid member ID'
            });
        }

        // Дополнительная проверка источника запроса.
        const origin = req.get('Origin');

        if (origin !== 'http://localhost:5500') {
            return res.status(403).json({
                error: 'Forbidden origin'
            });
        }

        try {

            /*
             * Удаляем участника только тогда, когда:
             *
             * - он состоит в выбранном пространстве;
             * - он НЕ является владельцем.
             *
             * Условие проверяем непосредственно в SQL.
             */

            const result = await pool.query(
                `
                DELETE FROM workspace_members AS wm

                USING workspaces AS w

                WHERE wm.workspace_id = $1
                  AND wm.user_id = $2
                  AND w.id = wm.workspace_id
                  AND w.created_by <> wm.user_id

                RETURNING wm.user_id
                `,
                [req.workspaceId, memberId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Removable member not found'
                });
            }

            return res.json({
                message: 'Member removed successfully',
                user_id: String(result.rows[0].user_id)
            });

        } catch (error) {

            console.error('Remove workspace member error:', error);

            return res.status(500).json({
                error: 'Failed to remove workspace member'
            });
        }
    }
);


module.exports = router;

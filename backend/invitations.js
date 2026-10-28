
/*
 * =====================================================
 * FAMILY HUB — INVITATIONS
 * =====================================================
 *
 * Здесь будут маршруты для работы с приглашениями.
 *
 * Сейчас реализуем:
 *
 * GET /invitations
 *
 * Позже добавим:
 * POST /invitations/:id/accept
 * POST /invitations/:id/decline
 */

const express = require('express');
const pool = require('./db');
const requireAuth = require('./middleware/requireAuth');

const router = express.Router();

// Все маршруты требуют авторизации.
router.use(requireAuth);


// =====================================================
// GET /invitations — МОИ ПРИГЛАШЕНИЯ
// =====================================================

router.get('/', async (req, res) => {

    // Получаем ID текущего пользователя
    // из серверной сессии.
    const userId = req.session.userId;

    try {

        // Находим ожидающие приглашения,
        // отправленные на подтверждённый Google email
        // текущего пользователя.
        //
        // Email от браузера НЕ принимаем.
        const result = await pool.query(
            `
            SELECT
                wi.id,
                wi.workspace_id,
                w.name AS workspace_name,
                wi.invited_email,
                wi.created_at,
                u.display_name AS invited_by_name
            FROM workspace_invitations wi

            INNER JOIN workspaces w
                ON w.id = wi.workspace_id

            INNER JOIN users u
                ON u.id = wi.invited_by

            -- invited_user — пользователь Family Hub,
            -- которому адресовано приглашение.
            INNER JOIN users invited_user
                ON lower(invited_user.email) = wi.invited_email

            -- Показываем приглашения только текущего
            -- авторизованного пользователя.
            WHERE invited_user.id = $1
            AND wi.status = 'pending'

            ORDER BY wi.created_at DESC, wi.id DESC
            `,
            [userId]
        );

        const invitations = result.rows.map(invitation => ({
            id: String(invitation.id),
            workspace_id: String(invitation.workspace_id),
            workspace_name: invitation.workspace_name,
            invited_email: invitation.invited_email,
            invited_by_name: invitation.invited_by_name,
            created_at: invitation.created_at
        }));

        return res.json(invitations);

    } catch (error) {

        console.error('Get invitations error:', error);

        return res.status(500).json({
            error: 'Failed to load invitations'
        });
    }
});


/*
 * =====================================================
 * POST /invitations/:id/accept
 * =====================================================
 *
 * Принятие приглашения в финансовое пространство.
 *
 * Важно:
 * - пользователь определяется по серверной сессии;
 * - приглашение должно принадлежать его email;
 * - приглашение должно иметь статус pending;
 * - добавление участника и принятие приглашения
 *   выполняются одной SQL-транзакцией.
 */

router.post('/:id/accept', async (req, res) => {

    // ================================================
    // ПРОВЕРКА ИСТОЧНИКА ЗАПРОСА
    // ================================================
    //
    // Origin показывает, с какого сайта браузер
    // отправил запрос.
    //
    // В режиме разработки наш frontend работает
    // по адресу http://localhost:5500.
    //
    // Другим сайтам запрещаем принимать приглашения.

    const origin = req.get('Origin');

    if (origin !== 'http://localhost:5500') {
        return res.status(403).json({
            error: 'Forbidden origin'
        });
    }

    // ID приглашения приходит из URL.
    const invitationId = req.params.id;

    // Проверяем, что ID — положительное целое число.
    if (!/^[1-9]\d*$/.test(String(invitationId))) {
        return res.status(400).json({
            error: 'Invalid invitation ID'
        });
    }

    // Пользователь определяется только по сессии.
    const userId = req.session.userId;

    let db;

    try {

        db = await pool.connect();

        // Начинаем SQL-транзакцию.
        await db.query('BEGIN');

        // Находим приглашение и блокируем его строку.
        //
        // Это защищает от одновременного принятия
        // одного приглашения несколькими запросами.
        //
        // Проверяем email внутри SQL, а не через req.body.
        const invitationResult = await db.query(
            `
            SELECT
                wi.id,
                wi.workspace_id

            FROM workspace_invitations wi

            INNER JOIN users u
                ON lower(u.email) = wi.invited_email

            WHERE wi.id = $1
              AND u.id = $2
              AND wi.status = 'pending'

            FOR UPDATE OF wi
            `,
            [invitationId, userId]
        );

        // Не раскрываем чужие приглашения.
        if (invitationResult.rows.length === 0) {

            await db.query('ROLLBACK');

            return res.status(404).json({
                error: 'Invitation not found'
            });
        }

        const invitation = invitationResult.rows[0];

        // Добавляем пользователя в пространство.
        //
        // ON CONFLICT защищает от повторного добавления,
        // если он уже состоит в этом пространстве.
        await db.query(
            `
            INSERT INTO workspace_members
                (workspace_id, user_id)

            VALUES ($1, $2)

            ON CONFLICT (workspace_id, user_id)
            DO NOTHING
            `,
            [invitation.workspace_id, userId]
        );

        // Отмечаем приглашение как принятое.
        await db.query(
            `
            UPDATE workspace_invitations
            SET status = 'accepted'
            WHERE id = $1
            `,
            [invitationId]
        );

        // Обе операции успешны — сохраняем изменения.
        await db.query('COMMIT');

        return res.json({
            message: 'Invitation accepted',
            workspace_id: String(invitation.workspace_id)
        });

    } catch (error) {

        // Если соединение получено, отменяем изменения.
        if (db) {
            try {
                await db.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Invitation rollback error:', rollbackError);
            }
        }

        console.error('Accept invitation error:', error);

        return res.status(500).json({
            error: 'Failed to accept invitation'
        });

    } finally {

        // Возвращаем соединение в пул.
        if (db) {
            db.release();
        }
    }
});


/*
 * =====================================================
 * POST /invitations/:id/decline
 * =====================================================
 *
 * Отклонение приглашения.
 *
 * Пользователь может отклонить только приглашение:
 * - адресованное его Google email;
 * - находящееся в статусе pending.
 *
 * В workspace_members ничего не добавляем.
 */

router.post('/:id/decline', async (req, res) => {

    // 1. Проверяем источник запроса.
    // Пока разрешаем только локальный frontend.
    const origin = req.get('Origin');

    if (origin !== 'http://localhost:5500') {
        return res.status(403).json({
            error: 'Forbidden origin'
        });
    }

    // 2. Проверяем ID приглашения из URL.
    const invitationId = req.params.id;

    if (!/^[1-9]\d*$/.test(invitationId)) {
        return res.status(400).json({
            error: 'Invalid invitation ID'
        });
    }

    // 3. Определяем пользователя по серверной сессии.
    const userId = req.session.userId;

    try {

        // 4. Обновляем статус только своего
        // ожидающего приглашения.
        //
        // Проверка принадлежности и изменение статуса
        // выполняются одним SQL-запросом.
        const result = await pool.query(
            `
            UPDATE workspace_invitations AS wi

            SET status = 'declined'

            FROM users AS invited_user

            WHERE wi.id = $1
              AND invited_user.id = $2
              AND LOWER(invited_user.email) = wi.invited_email
              AND wi.status = 'pending'

            RETURNING wi.id, wi.status
            `,
            [invitationId, userId]
        );

        // Чужое, уже обработанное или несуществующее
        // приглашение отклонять нельзя.
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Invitation not found'
            });
        }

        return res.json({
            message: 'Invitation declined',
            invitation_id: String(result.rows[0].id),
            status: result.rows[0].status
        });

    } catch (error) {

        console.error('Decline invitation error:', error);

        return res.status(500).json({
            error: 'Failed to decline invitation'
        });
    }
});


module.exports = router;
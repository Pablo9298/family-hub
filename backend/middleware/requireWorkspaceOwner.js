
/*
 * FAMILY HUB — WORKSPACE OWNER ACCESS
 *
 * Проверяет, является ли текущий пользователь
 * создателем финансового пространства.
 *
 * Используем для действий, которые нельзя
 * разрешать обычным участникам:
 *
 * - приглашение пользователей;
 * - удаление участников;
 * - удаление пространства.
 */

const pool = require('../db');

async function requireWorkspaceOwner(req, res, next) {

    // Получаем пользователя из серверной сессии.
    const userId = req.session?.userId;

    if (!userId) {
        return res.status(401).json({
            error: 'Authentication required'
        });
    }

    // Получаем ID пространства из адреса.
    const workspaceId = req.params.workspaceId;

    // Проверяем формат ID.
    if (!/^[1-9]\d*$/.test(String(workspaceId))) {
        return res.status(400).json({
            error: 'Invalid workspace ID'
        });
    }

    try {

        // Проверяем, что пространство создано
        // именно текущим пользователем.
        //
        // created_by — владелец пространства.
        const result = await pool.query(
            `
            SELECT id
            FROM workspaces
            WHERE id = $1
              AND created_by = $2
            `,
            [workspaceId, userId]
        );

        if (result.rows.length === 0) {

            // Не раскрываем существование
            // чужого пространства.
            return res.status(404).json({
                error: 'Workspace not found'
            });
        }

        // Сохраняем проверенный ID пространства.
        req.workspaceId = workspaceId;

        // Передаём управление следующему обработчику.
        next();

    } catch (error) {

        console.error('Workspace owner check failed:', error);

        return res.status(500).json({
            error: 'Failed to verify workspace ownership'
        });
    }
}

module.exports = requireWorkspaceOwner;


/*
 * FAMILY HUB — WORKSPACE ACCESS
 *
 * Проверяем, имеет ли авторизованный пользователь
 * доступ к конкретному финансовому пространству.
 *
 * Это важно: нельзя доверять workspaceId,
 * который приходит из браузера.
 */

const pool = require('../db');

async function requireWorkspace(req, res, next) {

    // ID текущего пользователя из серверной сессии.
    const userId = req.session?.userId;

    if (!userId) {
        return res.status(401).json({
            error: 'Authentication required'
        });
    }

    // Для будущих маршрутов используем адрес:
    // /workspaces/:workspaceId/transactions
    //
    // Например: /workspaces/1/transactions
    const workspaceId = req.params.workspaceId;

    // Проверяем, что ID — положительное целое число.
    if (!/^[1-9]\d*$/.test(String(workspaceId))) {
        return res.status(400).json({
            error: 'Invalid workspace ID'
        });
    }

    try {
        // Проверяем членство пользователя в пространстве.
        const result = await pool.query(
            `
            SELECT 1
            FROM workspace_members
            WHERE workspace_id = $1
              AND user_id = $2
            `,
            [workspaceId, userId]
        );

        if (result.rows.length === 0) {
            // Не раскрываем, существует ли чужое пространство.
            return res.status(404).json({
                error: 'Workspace not found'
            });
        }

        // Сохраняем проверенный ID для следующего обработчика.
        req.workspaceId = workspaceId;

        next();

    } catch (error) {
        console.error('Workspace access check failed:', error);

        res.status(500).json({
            error: 'Failed to verify workspace access'
        });
    }
}

module.exports = requireWorkspace;


/*
 * FAMILY HUB — AUTH USERS
 *
 * Работа с пользователями после успешного Google Login.
 *
 * Основная задача:
 * - найти пользователя по Google ID;
 * - если его нет, создать нового;
 * - вернуть пользователя Family Hub.
 */

const pool = require('./db');

async function findOrCreateGoogleUser(claims) {

    // sub — постоянный идентификатор Google-аккаунта.
    // Именно по нему определяем пользователя,
    // а не по email, который может измениться.
    const googleId = claims.sub;

    // Нормализуем email для нашей базы.
    const email = claims.email.trim().toLowerCase();

    // Имя, которое Google разрешил нам получить.
    const displayName = claims.name || email;

    // Получаем отдельное соединение PostgreSQL.
    // Оно необходимо для выполнения BEGIN/COMMIT.
    const db = await pool.connect();

    try {
        // Начинаем транзакцию.
        await db.query('BEGIN');

        // Ищем пользователя по Google ID.
        const existing = await db.query(
            `
            SELECT u.id, u.email, u.display_name
            FROM users u
            JOIN user_auth_providers p
                ON p.user_id = u.id
            WHERE p.provider = $1
              AND p.provider_user_id = $2
            `,
            ['google', googleId]
        );

        if (existing.rows.length > 0) {

            // Пользователь уже есть.
            await db.query('COMMIT');

            return existing.rows[0];
        }

        // ВАЖНО:
        // Не привязываем Google автоматически
        // к существующему аккаунту только по email.
        //
        // Связь должна определяться по Google sub.
        const emailExists = await db.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (emailExists.rows.length > 0) {
            throw new Error('EMAIL_ALREADY_REGISTERED');
        }

        // Создаём нового пользователя Family Hub.
        const created = await db.query(
            `
            INSERT INTO users (email, display_name)
            VALUES ($1, $2)
            RETURNING id, email, display_name
            `,
            [email, displayName]
        );

        const user = created.rows[0];

        // Связываем аккаунт Family Hub
        // с подтверждённым Google ID.
        await db.query(
            `
            INSERT INTO user_auth_providers
                (user_id, provider, provider_user_id)
            VALUES ($1, $2, $3)
            `,
            [user.id, 'google', googleId]
        );

        // Сохраняем обе записи одновременно.
        await db.query('COMMIT');

        return user;

    } catch (error) {

        // При ошибке отменяем изменения транзакции.
        await db.query('ROLLBACK');
        throw error;

    } finally {

        // Возвращаем соединение в пул.
        db.release();
    }
}

module.exports = {
    findOrCreateGoogleUser
};

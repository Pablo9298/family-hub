
/*
 * FAMILY HUB — WORKSPACE TRANSACTIONS
 *
 * Здесь будут финансовые операции
 * внутри конкретного пространства.
 *
 * Например:
 * GET /workspaces/1/transactions
 *
 * Пользователь должен быть авторизован
 * и состоять в указанном пространстве.
 */

const express = require('express');
const pool = require('./db');

const requireAuth = require('./middleware/requireAuth');
const requireWorkspace = require('./middleware/requireWorkspace');

// Находит или создаёт категорию в указанном пространстве.
const { findOrCreateCategory } = require('./categories');

const router = express.Router();

// Все маршруты этого модуля требуют авторизации.
router.use(requireAuth);


// =====================================================
// GET /:workspaceId/transactions
// =====================================================

router.get(
    '/:workspaceId/transactions',
    requireWorkspace,
    async (req, res) => {

        // Пространство уже проверено middleware.
        const workspaceId = req.workspaceId;

        try {
            const result = await pool.query(
                `
                SELECT
                    t.id,

                    -- Возвращаем дату как YYYY-MM-DD.
                    TO_CHAR(t.date, 'YYYY-MM-DD') AS date,

                    -- Во frontend используем поле desc.
                    t.description AS "desc",

                    t.amount,
                    t.type,

                    -- Название категории получаем через JOIN.
                    c.name AS category,

                    -- Кто добавил операцию.
                    t.created_by

                FROM transactions t

                INNER JOIN categories c
                    ON c.id = t.category_id
                   AND c.workspace_id = t.workspace_id

                -- Получаем только операции
                -- выбранного финансового пространства.
                WHERE t.workspace_id = $1

                ORDER BY t.id
                `,
                [workspaceId]
            );

            // Преобразуем PostgreSQL BIGINT и NUMERIC.
            const transactions = result.rows.map(row => ({
                id: Number(row.id),
                date: row.date,
                desc: row.desc,
                amount: Number(row.amount),
                type: row.type,
                category: row.category,
                created_by: Number(row.created_by)
            }));

            res.json(transactions);

        } catch (error) {
            console.error('Get workspace transactions error:', error);

            res.status(500).json({
                error: 'Failed to load transactions'
            });
        }
    }
);


/*
 * =====================================================
 * POST /:workspaceId/transactions
 * =====================================================
 *
 * Создаёт доход или расход внутри пространства.
 *
 * Например:
 * POST /workspaces/1/transactions
 *
 * {
 *   "date": "2026-10-22",
 *   "desc": "Покупка продуктов",
 *   "amount": 35.50,
 *   "type": "expense",
 *   "category": "Продукты"
 * }
 *
 * Сначала проверяем доступ к пространству,
 * затем создаём категорию и транзакцию.
 */

router.post(
    '/:workspaceId/transactions',
    requireWorkspace,
    async (req, res) => {

        // Эти значения приходят из формы frontend.
        const { date, desc, amount, type, category } = req.body ?? {};

        // Пространство уже проверено middleware.
        const workspaceId = req.workspaceId;

        // Автора берём только из серверной сессии.
        // Пользователь не может выбрать чужой created_by.
        const userId = req.session.userId;

        // =================================================
        // 1. ПРОВЕРКА ВХОДЯЩИХ ДАННЫХ
        // =================================================

        // Проверяем формат даты YYYY-MM-DD.
        if (
            typeof date !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(date)
        ) {
            return res.status(400).json({
                error: 'Invalid date'
            });
        }

        // PostgreSQL должен получить существующую дату,
        // а не просто строку, похожую на дату.
        const parsedDate = new Date(`${date}T00:00:00Z`);

        if (
            Number.isNaN(parsedDate.getTime()) ||
            parsedDate.toISOString().slice(0, 10) !== date
        ) {
            return res.status(400).json({
                error: 'Invalid date'
            });
        }

        if (
            typeof desc !== 'string' ||
            desc.trim().length === 0 ||
            desc.trim().length > 500
        ) {
            return res.status(400).json({
                error: 'Description must contain 1–500 characters'
            });
        }

        // Числовую строку "35.50" тоже принимаем.
        // Пустые строки и null — нет.
        if (
            (typeof amount !== 'number' &&
             typeof amount !== 'string') ||
            (typeof amount === 'string' && amount.trim() === '')
        ) {
            return res.status(400).json({
                error: 'Invalid amount'
            });
        }

        const numericAmount = Number(amount);

        if (
            !Number.isFinite(numericAmount) ||
            numericAmount <= 0 ||
            numericAmount > 9999999999.99 ||
            !Number.isInteger(Math.round(numericAmount * 100)) ||
            Math.abs(numericAmount * 100 -
                Math.round(numericAmount * 100)) > 0.000001
        ) {
            return res.status(400).json({
                error: 'Amount must be positive with up to 2 decimals'
            });
        }

        if (type !== 'income' && type !== 'expense') {
            return res.status(400).json({
                error: 'Type must be income or expense'
            });
        }

        if (
            typeof category !== 'string' ||
            category.trim().length === 0 ||
            category.trim().length > 100
        ) {
            return res.status(400).json({
                error: 'Invalid category'
            });
        }

        // =================================================
        // 2. СОЗДАНИЕ В POSTGRESQL
        // =================================================

        let db;

        try {
            // Получаем одно соединение PostgreSQL.
            // Все операции одной транзакции должны
            // выполняться через него.
            db = await pool.connect();

            await db.query('BEGIN');

            // Проверяем членство повторно внутри транзакции.
            // Блокировка предотвращает удаление членства
            // до завершения создания записи.
            const membership = await db.query(
                `
                SELECT 1
                FROM workspace_members
                WHERE workspace_id = $1
                  AND user_id = $2
                FOR SHARE
                `,
                [workspaceId, userId]
            );

            if (membership.rows.length === 0) {
                await db.query('ROLLBACK');

                return res.status(404).json({
                    error: 'Workspace not found'
                });
            }

            // Находим или создаём категорию
            // внутри выбранного пространства.
            const foundCategory = await findOrCreateCategory(
                category,
                type,
                workspaceId,
                db
            );

            // Добавляем финансовую операцию.
            const result = await db.query(
                `
                INSERT INTO transactions (
                    date,
                    description,
                    amount,
                    type,
                    category_id,
                    workspace_id,
                    created_by
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)

                RETURNING
                    id,
                    TO_CHAR(date, 'YYYY-MM-DD') AS date,
                    description AS "desc",
                    amount,
                    type,
                    created_by
                `,
                [
                    date,
                    desc.trim(),
                    numericAmount.toFixed(2),
                    type,
                    foundCategory.id,
                    workspaceId,
                    userId
                ]
            );

            await db.query('COMMIT');

            const transaction = result.rows[0];

            res.status(201).json({
                id: Number(transaction.id),
                date: transaction.date,
                desc: transaction.desc,
                amount: Number(transaction.amount),
                type: transaction.type,
                category: foundCategory.name,
                created_by: Number(transaction.created_by)
            });

        } catch (error) {

            if (db) {
                await db.query('ROLLBACK').catch(rollbackError => {
                    console.error('Rollback error:', rollbackError);
                });
            }

            console.error('Create transaction error:', error);

            res.status(500).json({
                error: 'Failed to create transaction'
            });

        } finally {
            if (db) {
                db.release();
            }
        }
    }
);


/*
 * =====================================================
 * PUT /:workspaceId/transactions/:id
 * =====================================================
 *
 * Редактируем существующую финансовую операцию.
 *
 * Например:
 * PUT /workspaces/1/transactions/1
 *
 * Можно изменить только нужные поля:
 * {
 *   "amount": 42.50,
 *   "category": "Транспорт"
 * }
 *
 * Поля, которые не передали, оставляем без изменений.
 */

router.put(
    '/:workspaceId/transactions/:id',
    requireWorkspace,
    async (req, res) => {

        // ID пространства уже проверен middleware.
        const workspaceId = req.workspaceId;

        // ID транзакции берём из URL.
        const transactionId = req.params.id;

        // ID текущего пользователя берём из сессии.
        const userId = req.session.userId;

        // Проверяем ID операции.
        if (!/^[1-9]\d*$/.test(String(transactionId))) {
            return res.status(400).json({
                error: 'Invalid transaction ID'
            });
        }

        // Получаем поля, которые пользователь хочет изменить.
        const { date, desc, amount, type, category } = req.body ?? {};

        // Не разрешаем пустой запрос без изменений.
        if (
            date === undefined &&
            desc === undefined &&
            amount === undefined &&
            type === undefined &&
            category === undefined
        ) {
            return res.status(400).json({
                error: 'No fields to update'
            });
        }

        // =================================================
        // 1. ПРОВЕРЯЕМ ПЕРЕДАННЫЕ ДАННЫЕ
        // =================================================

        // Дату проверяем, только если она передана.
        if (date !== undefined) {
            if (
                typeof date !== 'string' ||
                !/^\d{4}-\d{2}-\d{2}$/.test(date)
            ) {
                return res.status(400).json({
                    error: 'Invalid date'
                });
            }

            const parsedDate = new Date(`${date}T00:00:00Z`);

            if (
                Number.isNaN(parsedDate.getTime()) ||
                parsedDate.toISOString().slice(0, 10) !== date
            ) {
                return res.status(400).json({
                    error: 'Invalid date'
                });
            }
        }

        if (
            desc !== undefined &&
            (
                typeof desc !== 'string' ||
                desc.trim().length === 0 ||
                desc.trim().length > 500
            )
        ) {
            return res.status(400).json({
                error: 'Invalid description'
            });
        }

        let numericAmount;

        if (amount !== undefined) {
            if (
                (typeof amount !== 'number' &&
                 typeof amount !== 'string') ||
                (typeof amount === 'string' && amount.trim() === '')
            ) {
                return res.status(400).json({
                    error: 'Invalid amount'
                });
            }

            numericAmount = Number(amount);

            if (
                !Number.isFinite(numericAmount) ||
                numericAmount <= 0 ||
                numericAmount > 9999999999.99 ||
                Math.abs(
                    numericAmount * 100 -
                    Math.round(numericAmount * 100)
                ) > 0.000001
            ) {
                return res.status(400).json({
                    error: 'Invalid amount'
                });
            }
        }

        if (
            type !== undefined &&
            type !== 'income' &&
            type !== 'expense'
        ) {
            return res.status(400).json({
                error: 'Invalid transaction type'
            });
        }

        if (
            category !== undefined &&
            (
                typeof category !== 'string' ||
                category.trim().length === 0 ||
                category.trim().length > 100
            )
        ) {
            return res.status(400).json({
                error: 'Invalid category'
            });
        }

        // =================================================
        // 2. ОБНОВЛЯЕМ ДАННЫЕ В POSTGRESQL
        // =================================================

        let db;

        try {
            db = await pool.connect();

            // Все связанные SQL-запросы выполняем
            // через одно соединение PostgreSQL.
            await db.query('BEGIN');

            // Повторно проверяем участие внутри транзакции.
            // FOR SHARE удерживает запись членства
            // до завершения этой транзакции.
            const membership = await db.query(
                `
                SELECT 1
                FROM workspace_members
                WHERE workspace_id = $1
                  AND user_id = $2
                FOR SHARE
                `,
                [workspaceId, userId]
            );

            if (membership.rows.length === 0) {
                await db.query('ROLLBACK');

                return res.status(404).json({
                    error: 'Workspace not found'
                });
            }

            // Ищем транзакцию ТОЛЬКО внутри
            // проверенного финансового пространства.
            //
            // FOR UPDATE OF t блокирует эту операцию
            // до завершения транзакции.
            const existing = await db.query(
                `
                SELECT
                    t.id,
                    t.type,
                    c.name AS category
                FROM transactions t
                INNER JOIN categories c
                    ON c.id = t.category_id
                   AND c.workspace_id = t.workspace_id
                WHERE t.id = $1
                  AND t.workspace_id = $2
                FOR UPDATE OF t
                `,
                [transactionId, workspaceId]
            );

            if (existing.rows.length === 0) {
                await db.query('ROLLBACK');

                return res.status(404).json({
                    error: 'Transaction not found'
                });
            }

            const current = existing.rows[0];

            // Если тип или категорию не передали,
            // оставляем прежнее значение.
            const finalType = type ?? current.type;
            const finalCategory = category ?? current.category;

            // Находим подходящую категорию внутри
            // того же workspace.
            //
            // Если, например, пользователь поменял
            // expense на income, категория будет найдена
            // или создана именно для нового типа.
            const foundCategory = await findOrCreateCategory(
                finalCategory,
                finalType,
                workspaceId,
                db
            );

            // COALESCE берёт новое значение,
            // если оно не NULL, иначе оставляет старое.
            const result = await db.query(
                `
                UPDATE transactions
                SET
                    date = COALESCE($1::date, date),
                    description = COALESCE($2::text, description),
                    amount = COALESCE($3::numeric, amount),
                    type = $4,
                    category_id = $5

                WHERE id = $6
                  AND workspace_id = $7

                RETURNING
                    id,
                    TO_CHAR(date, 'YYYY-MM-DD') AS date,
                    description AS "desc",
                    amount,
                    type,
                    created_by
                `,
                [
                    date ?? null,
                    desc === undefined ? null : desc.trim(),
                    numericAmount === undefined
                        ? null
                        : numericAmount.toFixed(2),
                    finalType,
                    foundCategory.id,
                    transactionId,
                    workspaceId
                ]
            );

            // Сохраняем изменения.
            await db.query('COMMIT');

            const transaction = result.rows[0];

            return res.json({
                id: Number(transaction.id),
                date: transaction.date,
                desc: transaction.desc,
                amount: Number(transaction.amount),
                type: transaction.type,
                category: foundCategory.name,
                created_by: Number(transaction.created_by)
            });

        } catch (error) {

            if (db) {
                try {
                    await db.query('ROLLBACK');
                } catch (rollbackError) {
                    console.error('Rollback error:', rollbackError);
                }
            }

            console.error('Update transaction error:', error);

            return res.status(500).json({
                error: 'Failed to update transaction'
            });

        } finally {
            if (db) {
                db.release();
            }
        }
    }
);



/*
 * =====================================================
 * DELETE /:workspaceId/transactions/:id
 * =====================================================
 *
 * Удаляет финансовую операцию.
 *
 * Например:
 * DELETE /workspaces/1/transactions/1
 *
 * ВАЖНО:
 * - Пользователь должен быть авторизован.
 * - Пользователь должен состоять в workspace.
 * - Операция должна принадлежать этому workspace.
 *
 * Категорию при удалении операции НЕ удаляем,
 * так как её могут использовать другие записи.
 */

router.delete(
    '/:workspaceId/transactions/:id',
    requireWorkspace,
    async (req, res) => {

        // Получаем ID пространства из middleware.
        // requireWorkspace уже проверил членство.
        const workspaceId = req.workspaceId;

        // ID операции получаем из адреса запроса.
        const transactionId = req.params.id;

        // ID пользователя берём из серверной сессии.
        const userId = req.session.userId;

        // Проверяем, что ID транзакции имеет
        // формат положительного целого числа.
        if (!/^[1-9]\d*$/.test(String(transactionId))) {
            return res.status(400).json({
                error: 'Invalid transaction ID'
            });
        }

        let db;

        try {
            // Получаем соединение PostgreSQL.
            db = await pool.connect();

            // Начинаем SQL-транзакцию.
            await db.query('BEGIN');

            // Повторно проверяем членство внутри транзакции.
            //
            // FOR SHARE блокирует строку членства
            // до завершения нашей транзакции.
            const membership = await db.query(
                `
                SELECT 1
                FROM workspace_members
                WHERE workspace_id = $1
                  AND user_id = $2
                FOR SHARE
                `,
                [workspaceId, userId]
            );

            if (membership.rows.length === 0) {
                await db.query('ROLLBACK');

                return res.status(404).json({
                    error: 'Workspace not found'
                });
            }

            // Удаляем операцию только если она
            // принадлежит выбранному пространству.
            //
            // RETURNING id позволит узнать,
            // была ли найдена и удалена запись.
            const result = await db.query(
                `
                DELETE FROM transactions
                WHERE id = $1
                  AND workspace_id = $2
                RETURNING id
                `,
                [transactionId, workspaceId]
            );

            // Если строка не найдена, операция
            // не существует либо принадлежит
            // другому финансовому пространству.
            if (result.rows.length === 0) {
                await db.query('ROLLBACK');

                return res.status(404).json({
                    error: 'Transaction not found'
                });
            }

            // Подтверждаем удаление.
            await db.query('COMMIT');

            // Возвращаем ответ frontend.
            return res.json({
                message: 'Transaction deleted successfully',
                id: Number(result.rows[0].id)
            });

        } catch (error) {

            // Если произошла ошибка SQL,
            // отменяем незавершённую транзакцию.
            if (db) {
                try {
                    await db.query('ROLLBACK');
                } catch (rollbackError) {
                    console.error('Rollback error:', rollbackError);
                }
            }

            console.error('Delete transaction error:', error);

            return res.status(500).json({
                error: 'Failed to delete transaction'
            });

        } finally {

            // Возвращаем соединение в пул PostgreSQL.
            if (db) {
                db.release();
            }
        }
    }
);



module.exports = router;

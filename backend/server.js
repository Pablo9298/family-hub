
/*
 * FAMILY HUB — BACKEND SERVER
 *
 * Этот файл отвечает за HTTP API нашего приложения.
 *
 * Как проходят данные:
 *
 * Frontend
 *    |
 *    | HTTP-запрос (GET, POST, PUT, DELETE)
 *    v
 * Express (server.js)
 *    |
 *    | SQL-запрос через библиотеку pg
 *    v
 * PostgreSQL (Docker)
 *    |
 *    | Результат SQL-запроса
 *    v
 * Express
 *    |
 *    | JSON-ответ
 *    v
 * Frontend
 *
 * В этом файле находятся четыре CRUD-операции:
 *
 * GET    /transactions     — получить транзакции
 * POST   /transactions     — создать транзакцию
 * PUT    /transactions/:id — изменить транзакцию
 * DELETE /transactions/:id — удалить транзакцию
 */


// =====================================================
// 1. ПОДКЛЮЧАЕМ БИБЛИОТЕКИ
// =====================================================

// Подключаем Express для создания HTTP-сервера и маршрутов API.
const express = require('express');

// Подключаем CORS, чтобы frontend мог обращаться к backend
// с другого origin, например с другого локального порта.
const cors = require('cors');

// Импортируем pool из нашего файла db.js.
// Именно pool отправляет SQL-запросы в PostgreSQL.
const pool = require('./db');

// Настройки серверных сессий.
const sessionMiddleware = require('./session');

// Маршруты авторизации через Google.
const authRouter = require('./auth');

// API для создания и управления пространствами.
const workspaceRouter = require('./workspaces');

// Функции для работы с категориями.
const {
    findOrCreateCategory,
    normalizeCategory
} = require('./categories');

const workspaceTransactionsRouter = require('./workspaceTransactions');


// =====================================================
// 2. СОЗДАЁМ ПРИЛОЖЕНИЕ EXPRESS
// =====================================================

// express() создаёт объект приложения.
// Через app мы будем настраивать сервер и его маршруты.
const app = express();


// =====================================================
// 3. ПОДКЛЮЧАЕМ MIDDLEWARE
// =====================================================


// Читаем JSON-тело входящих запросов.
app.use(express.json());

// Разрешаем запросы только с нашего локального frontend.
// Браузер сможет передавать cookie между портами 5500 и 3001.
app.use(cors({
    origin: 'http://localhost:5500',
    credentials: true
}));

// Подключаем серверные сессии ДО маршрутов API.
//
// После этого в обработчиках запросов
// будет доступен объект req.session.
app.use(sessionMiddleware);

// Все маршруты из auth.js будут начинаться с /auth.
app.use('/auth', authRouter);

// Все маршруты workspaces.js будут начинаться с /workspaces.
app.use('/workspaces', workspaceRouter);

// Защищённые маршруты финансовых операций.
app.use('/workspaces', workspaceTransactionsRouter);

// =====================================================
// ПРИГЛАШЕНИЯ ПОЛЬЗОВАТЕЛЯ
// =====================================================

const invitationsRouter = require('./invitations');

app.use('/invitations', invitationsRouter);


/*
 * =====================================================
 * DISABLE LEGACY API
 * =====================================================
 *
 * Раньше приложение работало без аккаунтов
 * и отдельных финансовых пространств.
 *
 * Старые маршруты /transactions и /categories
 * не проверяют права пользователя.
 *
 * Поэтому блокируем их до удаления старого кода.
 *
 * Важно: этот middleware должен находиться
 * ПЕРЕД старыми маршрутами.
 */

app.use(['/transactions', '/categories'], (req, res) => {
    return res.status(410).json({
        error: 'Legacy API is disabled. Use workspace API.'
    });
});



// =====================================================
// 4. НАСТРАИВАЕМ ПОРТ
// =====================================================

// Backend будет принимать запросы на порту 3001.
// Например: http://localhost:3001/transactions
const PORT = 3001;


/*
 * =====================================================
 * GET /categories — ПОЛУЧЕНИЕ СПИСКА КАТЕГОРИЙ
 * =====================================================
 *
 * Когда frontend отправляет GET /categories,
 * Express выполняет SQL-запрос к PostgreSQL.
 *
 * Пример ответа:
 *
 * [
 *   { id: 1, name: 'продукты', type: 'expense' },
 *   { id: 2, name: 'зарплата', type: 'income' }
 * ]
 */
app.get('/categories', async (req, res) => {

    // try/catch помогает обработать возможные ошибки
    // подключения или выполнения SQL-запроса.
    try {

        // pool.query() отправляет SQL-запрос в PostgreSQL.
        const result = await pool.query(`
                SELECT id, name, type
                FROM categories
                ORDER BY type, name
            `);

        // PostgreSQL BIGINT через библиотеку pg
        // обычно возвращается строкой.
        //
        // map() создаёт новый массив, преобразуя ID в Number.
        const categories = result.rows.map(category => ({
            ...category,
            id: Number(category.id)
        }));

        // Отправляем результат frontend в формате JSON.
        return res.json(categories);
    } catch (error) {
        // Подробности ошибки выводим только в терминал backend.
        console.error('GET categories error:', error);

        // Клиенту возвращаем понятное сообщение.
        return res.status(500).json({
            message: 'Failed to load categories'
        });
    }
})


// =====================================================
// 5. GET /transactions — ПОЛУЧЕНИЕ ТРАНЗАКЦИЙ
// =====================================================

// app.get() регистрирует обработчик HTTP GET.
//
// req — входящий запрос клиента.
// res — ответ, который отправляем клиенту.
//
// async позволяет использовать await внутри обработчика.
app.get('/transactions', async (req, res) => {

    // try содержит код, который может завершиться ошибкой.
    try {

        // Отправляем SQL-запрос в PostgreSQL.
        // await дожидается результата, не блокируя весь сервер.
        const result = await pool.query(`
            SELECT
                -- id берём из таблицы транзакций.
                t.id,

                -- Преобразуем дату в строку YYYY-MM-DD.
                TO_CHAR(t.date, 'YYYY-MM-DD') AS date,

                -- В базе поле называется description,
                -- а frontend ожидает desc.
                t.description AS "desc",

                -- Сумма и тип операции.
                t.amount,
                t.type,

                -- Название берём из таблицы categories.
                -- AS category сохраняет привычное имя свойства
                -- в JSON-ответе для нашего frontend.
                c.name AS category

            -- t — сокращённое имя таблицы transactions.
            FROM transactions AS t

            -- c — сокращённое имя таблицы categories.
            -- INNER JOIN объединяет две таблицы.
            INNER JOIN categories AS c

                -- Условие соединения:
                -- категория транзакции должна совпасть
                -- с ID записи в таблице categories.
                ON t.category_id = c.id

            -- Сортируем операции по ID.
            ORDER BY t.id
        `);

        // result — объект ответа библиотеки pg.
        // result.rows — массив строк, полученных из PostgreSQL.
        //
        // map() создаёт новый массив на основе полученных строк.
        const transactions = result.rows.map(transaction => ({

            // Копируем все поля исходной транзакции.
            ...transaction,

            // PostgreSQL BIGINT через pg приходит строкой.
            // Для нашего текущего frontend преобразуем ID в число.
            id: Number(transaction.id),

            // NUMERIC тоже приходит строкой.
            // Преобразуем сумму для существующего frontend.
            amount: Number(transaction.amount)

        }));

        // Отправляем массив транзакций клиенту как JSON.
        // Express автоматически использует HTTP-статус 200 OK.
        return res.json(transactions);

    } catch (error) {

        // Записываем подробную ошибку в терминал backend.
        // Клиенту внутреннюю информацию о базе не раскрываем.
        console.error('Database error:', error);

        // 500 означает внутреннюю ошибку сервера.
        return res.status(500).json({
            message: 'Failed to load transactions'
        });
    }
});



/*
 * =====================================================
 * POST /transactions — ДОБАВЛЕНИЕ НОВОЙ ОПЕРАЦИИ
 * =====================================================
 *
 * Пример данных от frontend:
 *
 * {
 *     date: '2026-10-19',
 *     desc: 'Покупка в Lidl',
 *     amount: 25.50,
 *     category: 'ПроДукТы',
 *     type: 'expense'
 * }
 *
 * Задачи backend:
 * 1. Проверить данные.
 * 2. Найти или создать категорию "продукты".
 * 3. Получить ID этой категории.
 * 4. Сохранить транзакцию с category_id.
 * 5. Вернуть созданную операцию frontend.
 */

// Регистрируем маршрут POST /transactions.
app.post('/transactions', async (req, res) => {

    // Достаём данные из тела HTTP-запроса.
    const { date, desc, amount, category, type } = req.body ?? {};

    // Преобразуем сумму в число.
    const parsedAmount = Number(amount);

    // Проверяем дату в формате YYYY-MM-DD.
    const validDate =
        typeof date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        !Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) &&
        new Date(`${date}T00:00:00Z`)
            .toISOString()
            .slice(0, 10) === date;

    // Проверяем все обязательные поля.
    if (
        !validDate ||
        typeof desc !== 'string' ||
        !desc.trim() ||
        typeof category !== 'string' ||
        !normalizeCategory(category) ||
        !['income', 'expense'].includes(type) ||
        amount === undefined ||
        amount === null ||
        typeof amount === 'boolean' ||
        (typeof amount === 'string' && !amount.trim()) ||
        !Number.isFinite(parsedAmount) ||
        parsedAmount <= 0 ||
        parsedAmount > 9999999999.99 ||
        !Number.isInteger(Math.round(parsedAmount * 100)) ||
        Math.abs(
            parsedAmount * 100 - Math.round(parsedAmount * 100)
        ) > 0.000001
    ) {
        return res.status(400).json({
            message: 'Invalid transaction data'
        });
    }

    // Пока соединение не получено.
    let client;

    try {
        // Берём отдельное соединение из Pool.
        client = await pool.connect();

        // Начинаем SQL-транзакцию.
        // Дальнейшие изменения пока не подтверждены.
        await client.query('BEGIN');

        // Ищем категорию или создаём новую.
        // Передаём client, чтобы запрос использовал
        // ту же SQL-транзакцию.
        const categoryRecord = await findOrCreateCategory(
            category,
            type,
            client
        );

        // Получаем ID категории.
        const categoryId = categoryRecord.id;

        // Сохраняем финансовую операцию.
        // Здесь category_id заменяет старый столбец category.
        const result = await client.query(
            `
            INSERT INTO transactions
                (date, description, amount, category_id, type)

            VALUES ($1, $2, $3, $4, $5)

            RETURNING
                id,
                TO_CHAR(date, 'YYYY-MM-DD') AS date,
                description AS "desc",
                amount,
                type
            `,
            [
                date,               // $1
                desc.trim(),        // $2
                parsedAmount,       // $3
                categoryId,         // $4
                type                // $5
            ]
        );

        // Если все запросы прошли успешно,
        // подтверждаем изменения в PostgreSQL.
        await client.query('COMMIT');

        // Получаем созданную строку.
        const transaction = result.rows[0];

        // Отправляем результат frontend.
        // category возвращаем как текст,
        // чтобы существующий интерфейс работал без изменений.
        return res.status(201).json({
            ...transaction,
            id: Number(transaction.id),
            amount: Number(transaction.amount),
            category: categoryRecord.name
        });

    } catch (error) {

        // Если SQL-транзакция началась,
        // отменяем незавершённые изменения.
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('ROLLBACK error:', rollbackError);
            }
        }

        // Подробности записываем в терминал backend.
        console.error('POST transaction error:', error);

        // Пользователю возвращаем общую ошибку.
        return res.status(500).json({
            message: 'Failed to create transaction'
        });

    } finally {

        // ОБЯЗАТЕЛЬНО возвращаем соединение в Pool.
        // Это выполняется и при успехе, и при ошибке.
        if (client) {
            client.release();
        }
    }
});



// =====================================================
// 7. DELETE /transactions/:id — УДАЛЕНИЕ ТРАНЗАКЦИИ
// =====================================================

// :id — динамический параметр URL.
//
// Например:
// DELETE /transactions/4
//
// Тогда req.params.id будет равен строке "4".
app.delete('/transactions/:id', async (req, res) => {

    try {

        // Извлекаем ID из URL и преобразуем строку в число.
        const id = Number(req.params.id);

        // Проверяем, что ID — безопасное положительное целое число.
        if (!Number.isSafeInteger(id) || id <= 0) {

            // 400: ID имеет неправильный формат.
            return res.status(400).json({
                message: 'Invalid transaction ID'
            });
        }

        // Удаляем строку с нужным ID из PostgreSQL.
        const result = await pool.query(
            `DELETE FROM transactions
             WHERE id = $1
             RETURNING id`,

            // $1 принимает проверенный ID.
            [id]
        );

        // rowCount показывает количество затронутых строк.
        // Если 0, транзакция с таким ID не существует.
        if (result.rowCount === 0) {

            // 404 Not Found: запись не найдена.
            return res.status(404).json({
                message: 'Transaction not found'
            });
        }

        // Удаление прошло успешно.
        // res.json() без явного статуса отправляет 200 OK.
        return res.json({
            message: 'Transaction deleted successfully'
        });

    } catch (error) {

        // Логируем ошибку для отладки.
        console.error('DELETE error:', error);

        // Сообщаем клиенту о серверной ошибке.
        return res.status(500).json({
            message: 'Failed to delete transaction'
        });
    }
});



/*
 * =====================================================
 * PUT /transactions/:id — РЕДАКТИРОВАНИЕ ТРАНЗАКЦИИ
 * =====================================================
 *
 * Пример запроса:
 *
 * PUT /transactions/11
 *
 * {
 *     "amount": 30,
 *     "category": "ПРОДУКТЫ"
 * }
 *
 * Основная логика:
 *
 * 1. Проверяем ID и новые данные.
 * 2. Получаем существующую транзакцию.
 * 3. Определяем итоговую категорию и тип операции.
 * 4. Находим или создаём соответствующую категорию.
 * 5. Обновляем запись в PostgreSQL.
 * 6. Подтверждаем изменения через COMMIT.
 *
 * Всё выполняем в одной SQL-транзакции.
 */

app.put('/transactions/:id', async (req, res) => {

    // =================================================
    // 1. ПРОВЕРЯЕМ ID ТРАНЗАКЦИИ
    // =================================================

    // req.params.id получаем из адреса /transactions/:id.
    // Например, из /transactions/11 получим строку "11".
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            message: 'Invalid transaction ID'
        });
    }

    // =================================================
    // 2. ПОЛУЧАЕМ ДАННЫЕ ИЗ ТЕЛА ЗАПРОСА
    // =================================================

    // express.json() преобразует JSON в объект req.body.
    //
    // Если body отсутствует, используем пустой объект.
    const { date, desc, amount, category, type } = req.body ?? {};

    // =================================================
    // 3. ПРОВЕРЯЕМ ОПИСАНИЕ
    // =================================================

    // undefined означает, что поле не передавали.
    // В таком случае оставим прежнее описание.
    //
    // Но если поле передано, оно должно быть
    // непустой строкой.
    if (
        desc !== undefined &&
        (typeof desc !== 'string' || !desc.trim())
    ) {
        return res.status(400).json({
            message: 'Invalid description'
        });
    }

    // =================================================
    // 4. ПРОВЕРЯЕМ КАТЕГОРИЮ
    // =================================================

    // Нормализуем только переданное название.
    // Например: "  ПроДукТы  " -> "продукты".
    //
    // Если category не передана, пока оставляем
    // undefined: старое название получим из базы.
    const normalizedCategoryName = category === undefined
        ? undefined
        : normalizeCategory(category);

    if (
        category !== undefined &&
        !normalizedCategoryName
    ) {
        return res.status(400).json({
            message: 'Invalid category'
        });
    }

    // =================================================
    // 5. ПРОВЕРЯЕМ ТИП ОПЕРАЦИИ
    // =================================================

    if (
        type !== undefined &&
        !['income', 'expense'].includes(type)
    ) {
        return res.status(400).json({
            message: 'Invalid transaction type'
        });
    }

    // =================================================
    // 6. ПРОВЕРЯЕМ СУММУ
    // =================================================

    // Если amount отсутствует, не изменяем сумму.
    //
    // В противном случае преобразуем значение в число.
    const parsedAmount = amount === undefined
        ? null
        : Number(amount);

    if (
        amount !== undefined &&
        (
            amount === null ||
            typeof amount === 'boolean' ||
            (
                typeof amount === 'string' &&
                !amount.trim()
            ) ||
            !Number.isFinite(parsedAmount) ||
            parsedAmount <= 0 ||
            parsedAmount > 9999999999.99 ||

            // NUMERIC(12,2) хранит максимум
            // два знака после десятичного разделителя.
            Math.abs(
                parsedAmount * 100 -
                Math.round(parsedAmount * 100)
            ) > 0.000001
        )
    ) {
        return res.status(400).json({
            message: 'Invalid transaction amount'
        });
    }

    // =================================================
    // 7. ПРОВЕРЯЕМ ДАТУ
    // =================================================

    if (date !== undefined) {

        // Проверяем формат YYYY-MM-DD.
        if (
            typeof date !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(date)
        ) {
            return res.status(400).json({
                message: 'Invalid transaction date'
            });
        }

        // Проверяем, что календарная дата существует.
        // Например, 2026-02-30 должна быть отклонена.
        const parsedDate = new Date(`${date}T00:00:00Z`);

        if (
            Number.isNaN(parsedDate.getTime()) ||
            parsedDate.toISOString().slice(0, 10) !== date
        ) {
            return res.status(400).json({
                message: 'Invalid transaction date'
            });
        }
    }

    // =================================================
    // 8. ПОЛУЧАЕМ СОЕДИНЕНИЕ С POSTGRESQL
    // =================================================

    // Пока соединение не получено.
    let client;

    try {

        // Берём одно соединение из пула PostgreSQL.
        client = await pool.connect();

        // Начинаем SQL-транзакцию.
        await client.query('BEGIN');

        // =================================================
        // 9. ПОЛУЧАЕМ СТАРЫЕ ДАННЫЕ
        // =================================================

        const existingResult = await client.query(
            `
            SELECT
                t.id,
                t.type,
                c.name AS category

            FROM transactions AS t

            INNER JOIN categories AS c
                ON t.category_id = c.id

            WHERE t.id = $1

            -- Блокируем строку на время редактирования.
            FOR UPDATE OF t
            `,
            [id]
        );

        // Если транзакция не существует,
        // отменяем SQL-транзакцию и возвращаем 404.
        if (existingResult.rowCount === 0) {

            await client.query('ROLLBACK');

            return res.status(404).json({
                message: 'Transaction not found'
            });
        }

        // Получаем существующую транзакцию.
        const existingTransaction = existingResult.rows[0];

        // =================================================
        // 10. ОПРЕДЕЛЯЕМ ИТОГОВЫЕ ЗНАЧЕНИЯ
        // =================================================

        // Если новый type не пришёл,
        // сохраняем прежний тип операции.
        const finalType = type === undefined
            ? existingTransaction.type
            : type;

        // Если новая категория не пришла,
        // используем старое название.
        const finalCategory = normalizedCategoryName === undefined
            ? existingTransaction.category
            : normalizedCategoryName;

        // =================================================
        // 11. НАХОДИМ ИЛИ СОЗДАЁМ КАТЕГОРИЮ
        // =================================================

        // Даже если пользователь изменил только тип
        // expense -> income, функция найдёт или создаст
        // категорию для нового типа.
        //
        // Например:
        //
        // category = "ремонт", type = "expense"
        //                    |
        //                    v
        // category = "ремонт", type = "income"
        //
        // Это две разные категории в нашей системе.
        const categoryRecord = await findOrCreateCategory(
            finalCategory,
            finalType,
            client
        );

        // =================================================
        // 12. ОБНОВЛЯЕМ ТРАНЗАКЦИЮ
        // =================================================

        const updateResult = await client.query(
            `
            UPDATE transactions

            SET
                -- COALESCE берёт новое значение,
                -- если оно не NULL.
                --
                -- Иначе сохраняет старое значение.
                description = COALESCE($1, description),
                date = COALESCE($2, date),
                amount = COALESCE($3, amount),

                -- Категория теперь хранится по ID.
                category_id = $4,

                -- Тип берём с учётом изменений.
                type = $5

            WHERE id = $6

            RETURNING
                id,
                TO_CHAR(date, 'YYYY-MM-DD') AS date,
                description AS "desc",
                amount,
                type
            `,
            [
                desc === undefined ? null : desc.trim(),
                date === undefined ? null : date,
                parsedAmount,
                categoryRecord.id,
                finalType,
                id
            ]
        );

        // =================================================
        // 13. ПОДТВЕРЖДАЕМ ИЗМЕНЕНИЯ
        // =================================================

        await client.query('COMMIT');

        // Получаем обновлённую запись.
        const transaction = updateResult.rows[0];

        // Возвращаем JSON в формате, который
        // уже понимает наш frontend.
        return res.json({
            ...transaction,
            id: Number(transaction.id),
            amount: Number(transaction.amount),
            category: categoryRecord.name
        });

    } catch (error) {

        // =================================================
        // 14. ОТМЕНЯЕМ ИЗМЕНЕНИЯ ПРИ ОШИБКЕ
        // =================================================

        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('ROLLBACK error:', rollbackError);
            }
        }

        console.error('PUT transaction error:', error);

        return res.status(500).json({
            message: 'Failed to update transaction'
        });

    } finally {

        // =================================================
        // 15. ОСВОБОЖДАЕМ СОЕДИНЕНИЕ
        // =================================================

        // Возвращаем соединение в Pool.
        // Иначе при большом количестве запросов
        // свободные соединения могут закончиться.
        if (client) {
            client.release();
        }
    }
});



// =====================================================
// 9. ЗАПУСКАЕМ HTTP-СЕРВЕР
// =====================================================

// app.listen() начинает прослушивать указанный порт.
//
// После запуска приложение ожидает HTTP-запросы
// от браузера, frontend или curl.
app.listen(PORT, () => {

    // Сообщение в терминале подтверждает запуск Express.
    console.log(`Сервер запущен на порту ${PORT}`);
});

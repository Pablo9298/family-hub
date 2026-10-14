
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


// =====================================================
// 2. СОЗДАЁМ ПРИЛОЖЕНИЕ EXPRESS
// =====================================================

// express() создаёт объект приложения.
// Через app мы будем настраивать сервер и его маршруты.
const app = express();


// =====================================================
// 3. ПОДКЛЮЧАЕМ MIDDLEWARE
// =====================================================

// express.json() читает тело HTTP-запроса в формате JSON.
// После этого отправленные данные становятся доступны
// в req.body.
app.use(express.json());

// Разрешаем CORS-запросы.
// Пока это удобно для локальной разработки.
// Перед публикацией ограничим разрешённые источники.
app.use(cors());


// =====================================================
// 4. НАСТРАИВАЕМ ПОРТ
// =====================================================

// Backend будет принимать запросы на порту 3001.
// Например: http://localhost:3001/transactions
const PORT = 3001;


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
                id,

                -- Преобразуем DATE в строку YYYY-MM-DD.
                -- Это помогает избежать сдвига даты из-за часового пояса.
                TO_CHAR(date, 'YYYY-MM-DD') AS date,

                -- В PostgreSQL столбец называется description.
                -- Наш frontend ожидает свойство desc.
                -- AS переименовывает его только в результате запроса.
                description AS "desc",

                amount,
                category,
                type

            FROM transactions

            -- Возвращаем записи по возрастанию ID.
            ORDER BY id
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


// =====================================================
// 6. POST /transactions — СОЗДАНИЕ ТРАНЗАКЦИИ
// =====================================================

// Этот обработчик вызывается, когда клиент отправляет
// HTTP POST на /transactions.
app.post('/transactions', async (req, res) => {

    try {

        // Достаём нужные свойства из req.body.
        // Это называется деструктуризацией объекта.
        //
        // Например:
        // req.body = { desc: 'Кофе', amount: 4.50, ... }
        const { date, desc, amount, category, type } = req.body;

        // Преобразуем полученную сумму в число.
        const parsedAmount = Number(amount);

        // Проверяем обязательные поля перед записью в базу.
        if (
            // Дата обязательна.
            !date ||

            // Описание должно быть строкой.
            typeof desc !== 'string' ||

            // trim() убирает пробелы по краям.
            // Пустое описание запрещено.
            !desc.trim() ||

            // Категория должна быть строкой.
            typeof category !== 'string' ||

            // Пустая категория запрещена.
            !category.trim() ||

            // Сумма должна присутствовать.
            amount === undefined ||
            amount === null ||
            amount === '' ||

            // Сумма должна преобразовываться в конечное число.
            !Number.isFinite(parsedAmount) ||

            // Для нашей модели сумма должна быть положительной.
            parsedAmount <= 0 ||

            // type может быть только income или expense.
            !['income', 'expense'].includes(type)
        ) {

            // 400 Bad Request: клиент прислал неверные данные.
            // return завершает обработчик, чтобы код ниже
            // не попытался выполнить INSERT.
            return res.status(400).json({
                message: 'Invalid transaction data'
            });
        }

        // Отправляем параметризованный INSERT в PostgreSQL.
        const result = await pool.query(
            `INSERT INTO transactions
                (date, description, amount, category, type)

             -- $1 ... $5 получают значения из массива ниже.
             -- Значения передаются отдельно от SQL-кода.
             VALUES ($1, $2, $3, $4, $5)

             -- RETURNING возвращает созданную строку.
             RETURNING
                id,
                TO_CHAR(date, 'YYYY-MM-DD') AS date,
                description AS "desc",
                amount,
                category,
                type`,

            // Первый элемент массива соответствует $1,
            // второй — $2 и так далее.
            [
                date,
                desc.trim(),
                parsedAmount,
                category.trim(),
                type
            ]
        );

        // INSERT создал одну транзакцию.
        // Получаем её из первой строки результата.
        const transaction = result.rows[0];

        // 201 Created означает успешное создание записи.
        return res.status(201).json({

            // Копируем поля созданной транзакции.
            ...transaction,

            // Преобразуем ID и сумму в числа.
            id: Number(transaction.id),
            amount: Number(transaction.amount)
        });

    } catch (error) {

        // Показываем ошибку в терминале разработчика.
        console.error('POST error:', error);

        // Возвращаем клиенту сообщение о серверной ошибке.
        return res.status(500).json({
            message: 'Failed to create transaction'
        });
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


// =====================================================
// 8. PUT /transactions/:id — ОБНОВЛЕНИЕ ТРАНЗАКЦИИ
// =====================================================

// Этот обработчик позволяет менять уже существующую запись.
//
// Например:
// PUT /transactions/1
//
// Тело запроса:
// { "amount": 75.50 }
//
// При этом остальные поля должны остаться прежними.
app.put('/transactions/:id', async (req, res) => {

    try {

        // Получаем ID из адреса запроса.
        const id = Number(req.params.id);

        // Проверяем корректность ID.
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({
                message: 'Invalid transaction ID'
            });
        }

        // Получаем поля, которые клиент хочет изменить.
        //
        // Некоторые поля могут отсутствовать.
        // В таком случае их значение будет undefined.
        const { date, desc, amount, category, type } = req.body;

        // -------------------------------------------------
        // Проверяем description
        // -------------------------------------------------

        // Если описание передано, оно должно быть
        // непустой строкой.
        if (
            desc !== undefined &&
            (typeof desc !== 'string' || !desc.trim())
        ) {
            return res.status(400).json({
                message: 'Invalid description'
            });
        }

        // -------------------------------------------------
        // Проверяем category
        // -------------------------------------------------

        // Если категория передана, проверяем её тип
        // и запрещаем пустые строки.
        if (
            category !== undefined &&
            (typeof category !== 'string' || !category.trim())
        ) {
            return res.status(400).json({
                message: 'Invalid category'
            });
        }

        // -------------------------------------------------
        // Проверяем type
        // -------------------------------------------------

        // Если type не передан, сохраняем старое значение.
        // Если передан — разрешаем только два значения.
        if (
            type !== undefined &&
            !['income', 'expense'].includes(type)
        ) {
            return res.status(400).json({
                message: 'Invalid transaction type'
            });
        }

        // -------------------------------------------------
        // Проверяем amount
        // -------------------------------------------------

        // Если сумма не передана, используем null.
        // Позже COALESCE сохранит старую сумму.
        //
        // Если сумма передана, преобразуем её в число.
        const parsedAmount = amount === undefined
            ? null
            : Number(amount);

        // Проверяем сумму только тогда, когда она передана.
        if (
            amount !== undefined &&
            (
                // null запрещён как новая сумма.
                amount === null ||

                // true/false не должны считаться суммами.
                typeof amount === 'boolean' ||

                // Строка только из пробелов недопустима.
                (
                    typeof amount === 'string' &&
                    !amount.trim()
                ) ||

                // Число должно быть конечным.
                !Number.isFinite(parsedAmount) ||

                // Сумма должна быть положительной.
                parsedAmount <= 0 ||

                // Ограничение размера NUMERIC(12, 2).
                parsedAmount > 9999999999.99 ||

                // Проверяем, что нет более двух знаков
                // после запятой.
                Math.round(parsedAmount * 100) !==
                    parsedAmount * 100
            )
        ) {
            return res.status(400).json({
                message: 'Invalid transaction amount'
            });
        }

        // -------------------------------------------------
        // Проверяем date
        // -------------------------------------------------

        // Если дата не передана, оставляем старую.
        if (date !== undefined) {

            // Дата должна быть строкой формата YYYY-MM-DD.
            if (
                typeof date !== 'string' ||
                !/^\d{4}-\d{2}-\d{2}$/.test(date)
            ) {
                return res.status(400).json({
                    message: 'Invalid transaction date'
                });
            }

            // Создаём объект Date для проверки реальности даты.
            const parsedDate = new Date(`${date}T00:00:00Z`);

            // Отвергаем несуществующие календарные даты.
            if (
                Number.isNaN(parsedDate.getTime()) ||
                parsedDate.toISOString().slice(0, 10) !== date
            ) {
                return res.status(400).json({
                    message: 'Invalid transaction date'
                });
            }
        }

        // -------------------------------------------------
        // Выполняем UPDATE в PostgreSQL
        // -------------------------------------------------

        const result = await pool.query(
            `UPDATE transactions

             -- COALESCE берёт первое значение, если оно
             -- не NULL, иначе оставляет значение из БД.
             SET description = COALESCE($1, description),
                 date = COALESCE($2, date),
                 amount = COALESCE($3, amount),
                 category = COALESCE($4, category),
                 type = COALESCE($5, type)

             -- Изменяем только строку с нужным ID.
             WHERE id = $6

             -- Возвращаем обновлённую запись.
             RETURNING
                 id,
                 TO_CHAR(date, 'YYYY-MM-DD') AS date,
                 description AS "desc",
                 amount,
                 category,
                 type`,

            // Значения массива соответствуют $1 ... $6.
            [
                // $1: описание либо null.
                desc === undefined ? null : desc.trim(),

                // $2: дата либо null.
                date ?? null,

                // $3: новая сумма либо null.
                parsedAmount,

                // $4: категория либо null.
                category === undefined ? null : category.trim(),

                // $5: тип либо null.
                type ?? null,

                // $6: ID обновляемой транзакции.
                id
            ]
        );

        // Если UPDATE не нашёл строку, возвращаем 404.
        if (result.rowCount === 0) {
            return res.status(404).json({
                message: 'Transaction not found'
            });
        }

        // Получаем обновлённую строку из результата pg.
        const transaction = result.rows[0];

        // Отправляем обновлённую транзакцию frontend.
        // Статус по умолчанию — 200 OK.
        return res.json({
            ...transaction,
            id: Number(transaction.id),
            amount: Number(transaction.amount)
        });

    } catch (error) {

        // Записываем ошибку в терминал.
        console.error('PUT error:', error);

        // Отправляем клиенту HTTP 500.
        return res.status(500).json({
            message: 'Failed to update transaction'
        });
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

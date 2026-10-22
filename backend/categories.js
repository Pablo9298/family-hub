/*
 * FAMILY HUB — РАБОТА С КАТЕГОРИЯМИ
 *
 * Здесь хранится логика категорий.
 *
 * Например, пользователь вводит:
 *   "  ПроДукТы  "
 *
 * Мы превращаем это в:
 *   "продукты"
 *
 * После этого ищем такую категорию в PostgreSQL.
 * Если её нет — создаём.
 */

// Импортируем подключение к PostgreSQL.
const pool = require('./db');

// =====================================================
// 1. НОРМАЛИЗАЦИЯ НАЗВАНИЯ
// =====================================================

function normalizeCategory(name) {

    // Сначала проверяем, что получили строку.
    // Иначе методы trim() и replace() могут вызвать ошибку.
    if (typeof name !== 'string') {
        return '';
    }

    return name
        .trim()                 // Убираем пробелы по краям.
        .replace(/\s+/g, ' ')  // Несколько пробелов -> один.
        .toLowerCase();        // Переводим буквы в нижний регистр.
}


// =====================================================
// 2. НАЙТИ ИЛИ СОЗДАТЬ КАТЕГОРИЮ
// =====================================================


/*
 * Ищет или создаёт категорию
 * ВНУТРИ конкретного финансового пространства.
 *
 * name        — название категории.
 * type        — income или expense.
 * workspaceId — ID пространства.
 * db          — соединение PostgreSQL.
 *
 * db может быть:
 * - обычным pool;
 * - клиентом, полученным через pool.connect().
 *
 * Второй вариант нужен, когда категория создаётся
 * внутри SQL-транзакции вместе с финансовой операцией.
 */

async function findOrCreateCategory(
    name,
    type,
    workspaceId,
    db = pool
) {
    // Приводим название к единому формату.
    // Например: "  ТРАНСПОРТ " → "транспорт".
    const normalizedName = normalizeCategory(name);

    // UPSERT:
    //
    // Если категория ещё не существует —
    // PostgreSQL создаёт её.
    //
    // Если категория уже существует в этом
    // пространстве с таким же типом —
    // возвращает существующую.
    const result = await db.query(
        `
        INSERT INTO categories (
            name,
            type,
            workspace_id
        )
        VALUES ($1, $2, $3)

        ON CONFLICT (workspace_id, name, type)
        DO UPDATE SET
            name = EXCLUDED.name

        RETURNING id, name, type, workspace_id
        `,
        [normalizedName, type, workspaceId]
    );

    // Возвращаем созданную или найденную категорию.
    return {
        id: Number(result.rows[0].id),
        name: result.rows[0].name,
        type: result.rows[0].type,
        workspace_id: Number(result.rows[0].workspace_id)
    };
}


// =====================================================
// 3. ЭКСПОРТ ФУНКЦИЙ
// =====================================================

// Теперь другие файлы могут импортировать эти функции.
module.exports = {
    normalizeCategory,
    findOrCreateCategory
};
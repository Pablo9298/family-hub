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

async function findOrCreateCategory(name, type, db = pool) {

    // Приводим название к единому формату.
    const normalizedName = normalizeCategory(name);

    // Проверяем данные до обращения к базе.
    if (
        !normalizedName ||
        !['income', 'expense'].includes(type)
    ) {
        throw new Error('Invalid category data');
    }

    // Отправляем параметризованный запрос.
    const result = await db.query(
        `
        INSERT INTO categories (name, type)

        -- $1 = название, $2 = тип.
        VALUES ($1, $2)

        -- Если такое сочетание уже есть,
        -- не создаём дубликат.
        ON CONFLICT (name, type)

        -- Возвращаем существующую запись.
        DO UPDATE SET name = EXCLUDED.name

        -- Получаем ID категории.
        RETURNING id, name, type
        `,
        [normalizedName, type]
    );

    // Возвращаем объект категории.
    return result.rows[0];
}

// =====================================================
// 3. ЭКСПОРТ ФУНКЦИЙ
// =====================================================

// Теперь другие файлы могут импортировать эти функции.
module.exports = {
    normalizeCategory,
    findOrCreateCategory
};
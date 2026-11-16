
/*
 * =====================================================
 * FAMILY HUB — POSTGRESQL CONNECTION
 * =====================================================
 *
 * Настройка подключения к PostgreSQL.
 *
 * У нас два независимых окружения:
 *
 * development -> .env.development -> family_hub_dev
 * production  -> .env             -> family_hub
 *
 * ВАЖНО:
 * - NODE_ENV должен быть указан явно.
 * - Каждый режим может работать только со своей базой.
 * - Настройки берём из соответствующего .env файла.
 * - После подключения проверяем имя реальной базы.
 * =====================================================
 */

const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');


// =====================================================
// 1. ОПРЕДЕЛЯЕМ РЕЖИМ РАБОТЫ
// =====================================================

const environment = process.env.NODE_ENV;

if (!['development', 'production'].includes(environment)) {
    throw new Error(
        'NODE_ENV must be development or production'
    );
}


// =====================================================
// 2. ВЫБИРАЕМ ФАЙЛ И ОЖИДАЕМУЮ БАЗУ
// =====================================================

const isDevelopment = environment === 'development';

const envFile = isDevelopment
    ? '.env.development'
    : '.env';

const expectedDatabase = isDevelopment
    ? 'family_hub_dev'
    : 'family_hub';


// =====================================================
// 3. ЗАГРУЖАЕМ НАСТРОЙКИ
// =====================================================

// Используем абсолютный путь относительно backend/db.js,
// поэтому запуск не зависит от текущей папки терминала.
//
// override: true означает, что значения из выбранного
// файла имеют приоритет над уже установленными
// переменными окружения с такими же именами.

const envResult = dotenv.config({
    path: path.join(__dirname, '..', envFile),
    override: true
});

if (envResult.error) {
    throw new Error(
        `Cannot load ${envFile}: ${envResult.error.message}`
    );
}


// =====================================================
// 4. ПРОВЕРЯЕМ ОБЯЗАТЕЛЬНЫЕ НАСТРОЙКИ
// =====================================================

const requiredVariables = [
    'DB_NAME',
    'DB_USER',
    'DB_HOST',
    'DB_PASSWORD'
];

for (const variable of requiredVariables) {
    if (!process.env[variable]) {
        throw new Error(
            `${variable} is not configured in ${envFile}`
        );
    }
}


// =====================================================
// 5. ЗАЩИЩАЕМ БАЗЫ ДАННЫХ
// =====================================================

// Проверяем точное имя базы для каждого режима.
//
// DEVELOPMENT -> только family_hub_dev
// PRODUCTION  -> только family_hub
//
// Это предотвращает случайное использование
// семейной базы во время разработки.

if (process.env.DB_NAME !== expectedDatabase) {
    throw new Error(
        `${environment} must use ${expectedDatabase}, ` +
        `but DB_NAME is ${process.env.DB_NAME}`
    );
}


// =====================================================
// 6. СОЗДАЁМ ПУЛ ПОДКЛЮЧЕНИЙ
// =====================================================

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT || 5432)
});


// =====================================================
// 7. ПРОВЕРЯЕМ ФАКТИЧЕСКУЮ БАЗУ
// =====================================================

// PostgreSQL дополнительно сообщит, к какой базе
// установлено реальное соединение.
//
// Эта проверка выполняется перед запуском HTTP-сервера
// через отдельную функцию verifyDatabaseConnection().

async function verifyDatabaseConnection() {
    const result = await pool.query(
        'SELECT current_database() AS database_name'
    );

    const actualDatabase = result.rows[0].database_name;

    if (actualDatabase !== expectedDatabase) {
        throw new Error(
            `Wrong database connection: ${actualDatabase}`
        );
    }

    console.log(
        `[Database] ${environment} -> ${actualDatabase}`
    );
}


// =====================================================
// 8. ЭКСПОРТИРУЕМ ПОДКЛЮЧЕНИЕ
// =====================================================

// Существующий код продолжает использовать pool,
// как и раньше.
//
// Функцию проверки добавляем отдельным свойством,
// чтобы не ломать текущие импорты.

pool.verifyDatabaseConnection = verifyDatabaseConnection;

module.exports = pool;

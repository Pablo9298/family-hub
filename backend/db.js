
/*
 * =====================================================
 * FAMILY HUB — POSTGRESQL CONNECTION
 * =====================================================
 *
 * Здесь настраиваем подключение к базе данных.
 *
 * У нас два окружения:
 *
 * development -> .env.development -> family_hub_dev
 * production  -> .env             -> family_hub
 *
 * ВАЖНО:
 * Если NODE_ENV не указан, подключение запрещено.
 * Это защищает основную базу от случайного запуска.
 * =====================================================
 */

const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');


// =====================================================
// 1. ОПРЕДЕЛЯЕМ РЕЖИМ РАБОТЫ
// =====================================================

// NODE_ENV передаём при запуске Node.js.
//
// Например:
// NODE_ENV=development node server.js

const environment = process.env.NODE_ENV;

// Разрешаем только явно указанные режимы.
if (!['development', 'production'].includes(environment)) {
    throw new Error(
        'NODE_ENV must be development or production'
    );
}


// =====================================================
// 2. ВЫБИРАЕМ ФАЙЛ НАСТРОЕК
// =====================================================

// Для разработки используем тестовую базу.
// Для production — основную.

const envFile = environment === 'development'
    ? '.env.development'
    : '.env';

// Загружаем переменные окружения из корня проекта.
dotenv.config({
    path: path.join(__dirname, '..', envFile)
});


// =====================================================
// 3. ПРОВЕРЯЕМ КОНФИГУРАЦИЮ
// =====================================================

// Название базы обязательно должно присутствовать.
if (!process.env.DB_NAME) {
    throw new Error('DB_NAME is not configured');
}

// Защита разработки.
//
// Если случайно указать основную базу в
// .env.development, приложение остановится.
if (
    environment === 'development' &&
    process.env.DB_NAME !== 'family_hub_dev'
) {
    throw new Error(
        'Development must use family_hub_dev'
    );
}

// Защита production.
//
// Основной режим не должен использовать тестовую базу.
if (
    environment === 'production' &&
    process.env.DB_NAME === 'family_hub_dev'
) {
    throw new Error(
        'Production cannot use development database'
    );
}


// =====================================================
// 4. СОЗДАЁМ ПОДКЛЮЧЕНИЕ К POSTGRESQL
// =====================================================

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT || 5432)
});


// =====================================================
// 5. ПОКАЗЫВАЕМ ВЫБРАННУЮ БАЗУ
// =====================================================

// Выводим только название окружения и базы.
// Пароли и секреты никогда не выводим.

console.log(
    `[Database] ${environment} -> ${process.env.DB_NAME}`
);


// Экспортируем подключение для других файлов backend.
module.exports = pool;

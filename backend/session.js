
/*
 * FAMILY HUB — SESSION CONFIGURATION
 *
 * Сессия позволяет серверу запомнить пользователя
 * между отдельными HTTP-запросами.
 *
 * Браузер хранит cookie с идентификатором сессии,
 * а данные сессии находятся в PostgreSQL.
 */

// Библиотека для создания серверных сессий Express.
const session = require('express-session');

// Подключаем хранилище сессий для PostgreSQL.
const PgSession = require('connect-pg-simple')(session);

// Используем существующее подключение к базе.
const pool = require('./db');

// Проверяем, что секретный ключ настроен.
if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is missing in .env');
}

// Создаём middleware для сессий.
const sessionMiddleware = session({

    // У каждого окружения своё имя cookie.
    //
    // Это важно, потому что development и production
    // могут работать на localhost в одном браузере.
    //
    // Иначе браузер будет отправлять одну и ту же
    // cookie обеим версиям приложения.
    name: process.env.NODE_ENV === 'development'
        ? 'familyhub.dev.sid'
        : 'familyhub.sid',

    // Храним сессии в PostgreSQL вместо памяти Node.js.
    store: new PgSession({
        pool: pool,

        // Хранилище создаст свою служебную таблицу.
        createTableIfMissing: true
    }),

    // Секрет используется для подписи cookie.
    secret: process.env.SESSION_SECRET,

    // Не сохраняем сессию повторно, если она не менялась.
    resave: false,

    // Не создаём сессию для каждого
    // неавторизованного посетителя.
    saveUninitialized: false,

    // Настройки cookie.
    cookie: {
        // Запрещает JavaScript читать cookie через document.cookie.
        httpOnly: true,

        // Защита от передачи cookie через HTTP
        // будет включена на HTTPS в production.
        secure: process.env.NODE_ENV === 'production',

        // Для нашего сценария сессий подойдёт Lax.
        sameSite: 'lax',

        // Сессия действует до 7 дней.
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
});

module.exports = sessionMiddleware;

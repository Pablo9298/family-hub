
/*
 * FAMILY HUB — GOOGLE AUTHENTICATION
 *
 * Этот модуль будет отвечать за вход через Google.
 *
 * Используем OpenID Connect (OIDC).
 * Google подтверждает личность пользователя,
 * а Family Hub создаёт собственную сессию.
 *
 * ВАЖНО:
 * Здесь мы пока только настраиваем подключение
 * к Google. Маршруты входа добавим следующим шагом.
 */

// openid-client v6 — это ES Module.
//
// Наш backend использует CommonJS (require),
// поэтому загружаем библиотеку через import().
const googleClientPromise = import('openid-client');

// =====================================================
// GOOGLE OAUTH — ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ
// =====================================================
//
// Используем настройки, которые уже загрузил db.js.
//
// development -> .env.development
// production  -> .env
//
// Не вызываем dotenv.config() повторно.
// Это предотвращает смешивание конфигураций.

require('./db');

// Конфигурация Google будет загружена один раз,
// а затем повторно использована при авторизации.
let googleConfigPromise = null;

async function getGoogleConfig() {

    // Если конфигурация уже загружается или загружена,
    // возвращаем существующий Promise.
    if (googleConfigPromise) {
        return googleConfigPromise;
    }

    // Проверяем обязательные настройки.
    if (
        !process.env.GOOGLE_CLIENT_ID ||
        !process.env.GOOGLE_CLIENT_SECRET ||
        !process.env.GOOGLE_REDIRECT_URI
    ) {
        throw new Error('Google OAuth settings are missing in .env');
    }

    // Получаем функции библиотеки openid-client.
    const client = await googleClientPromise;

    // Google предоставляет специальный адрес,
    // через который можно получить настройки
    // сервера авторизации.
    const googleIssuer = new URL('https://accounts.google.com');

    // discovery автоматически получает адреса
    // авторизации, выдачи токенов и другие настройки.
    googleConfigPromise = client.discovery(
        googleIssuer,
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );

    try {
        return await googleConfigPromise;
    } catch (error) {

        // Если Google временно недоступен,
        // разрешаем повторить загрузку позже.
        googleConfigPromise = null;
        throw error;
    }
}

module.exports = {
    getGoogleConfig
};

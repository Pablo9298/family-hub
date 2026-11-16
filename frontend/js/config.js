
/*
 * =====================================================
 * FAMILY HUB — FRONTEND CONFIGURATION
 * =====================================================
 *
 * Здесь определяется адрес backend.
 *
 * DEVELOPMENT:
 * Frontend запускаем через Live Server на порту 5500.
 * Backend работает на localhost:3002.
 * База данных: family_hub_dev.
 *
 * FAMILY MODE:
 * Express отдаёт frontend и API через один адрес.
 * Tailscale Serve предоставляет HTTPS.
 * База данных: family_hub.
 *
 * ВАЖНО:
 * Этот файл выбирает только адрес API.
 * Настоящую базу определяет NODE_ENV на backend.
 * =====================================================
 */

// Проверяем, открыт ли frontend через локальный
// сервер разработки VS Code.
const isLocalDevelopment =
    window.location.hostname === 'localhost' &&
    window.location.port === '5500';

// В разработке обращаемся к отдельному backend.
//
// В семейном режиме API находится на том же
// адресе, с которого открыт сайт.
export const API_BASE = isLocalDevelopment
    ? 'http://localhost:3002'
    : window.location.origin;

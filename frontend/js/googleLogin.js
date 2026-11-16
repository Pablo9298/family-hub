
/*
 * =====================================================
 * FAMILY HUB — GOOGLE LOGIN LINKS
 * =====================================================
 *
 * DEVELOPMENT:
 * Frontend работает на localhost:5500,
 * backend — на localhost:3001.
 *
 * PRODUCTION:
 * Frontend и backend используют один HTTPS-адрес.
 *
 * Этот модуль настраивает ссылки входа через Google
 * в зависимости от адреса открытого сайта.
 * =====================================================
 */

import { API_BASE } from './config.js';

// Находим все ссылки входа через Google.
const googleLoginLinks = document.querySelectorAll(
    'a[href="/auth/google"]'
);

// Указываем правильный адрес авторизации.
googleLoginLinks.forEach((link) => {
    link.href = `${API_BASE}/auth/google`;
});

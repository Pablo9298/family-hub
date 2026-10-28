
/*
 * =====================================================
 * FAMILY HUB — ПРОВЕРКА ORIGIN
 * =====================================================
 *
 * Проверяем источник запросов, изменяющих данные.
 *
 * GET, HEAD, OPTIONS пропускаем.
 *
 * POST, PUT, PATCH, DELETE должны поступать
 * с разрешённого frontend.
 *
 * ВАЖНО:
 * Это промежуточная защита для локальной разработки.
 * Перед production добавим полноценную CSRF-защиту.
 */

const TRUSTED_ORIGIN = 'http://localhost:5500';

function requireTrustedOrigin(req, res, next) {

    // Безопасные HTTP-методы не изменяют данные.
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    // Получаем Origin браузера.
    const origin = req.get('Origin');

    // Запросы без Origin или с другого сайта отклоняем.
    if (origin !== TRUSTED_ORIGIN) {
        return res.status(403).json({
            error: 'Forbidden origin'
        });
    }

    next();
}

module.exports = requireTrustedOrigin;


/*
 * =====================================================
 * FAMILY HUB — ПРОВЕРКА ORIGIN
 * =====================================================
 *
 * Защищаем запросы, которые изменяют данные:
 * POST, PUT, PATCH, DELETE.
 *
 * DEVELOPMENT:
 * Frontend работает через localhost:5500.
 *
 * PRODUCTION:
 * Frontend и backend доступны через один
 * HTTPS-адрес Tailscale.
 *
 * Запросы с других сайтов отклоняем.
 *
 * ВАЖНО:
 * Это защита на основе Origin.
 * Дополнительные меры CSRF-защиты и проверки
 * сессий продолжаем учитывать отдельно.
 * =====================================================
 */

// В зависимости от режима выбираем разрешённый
// адрес frontend без завершающего слеша.

const TRUSTED_ORIGIN =
    process.env.NODE_ENV === 'production'
        ? 'https://pablo9298.tail62ffac.ts.net'
        : 'http://localhost:5500';


function requireTrustedOrigin(req, res, next) {

    // Запросы на чтение данных не изменяют
    // состояние приложения.
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    // Браузер передаёт Origin при запросах,
    // которые изменяют данные.
    const origin = req.get('Origin');

    // Разрешаем запросы только с доверенного адреса.
    // Отсутствующий или другой Origin отклоняем.
    if (origin !== TRUSTED_ORIGIN) {
        return res.status(403).json({
            error: 'Forbidden origin'
        });
    }

    next();
}

module.exports = requireTrustedOrigin;

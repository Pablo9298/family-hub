
/*
 * FAMILY HUB — AUTH MIDDLEWARE
 *
 * Middleware — функция, которая выполняется
 * перед обработчиком HTTP-запроса.
 *
 * Проверяем, вошёл ли пользователь в Family Hub.
 */

function requireAuth(req, res, next) {

    // Во время Google Login мы сохранили
    // внутренний ID пользователя в сессии:
    //
    // req.session.userId = user.id.toString();
    //
    // Если этого ID нет, значит пользователь
    // не прошёл авторизацию в Family Hub.

    if (!req.session?.userId) {
        return res.status(401).json({
            error: 'Authentication required'
        });
    }

    // Пользователь авторизован.
    // Передаём запрос следующему обработчику.
    next();
}

module.exports = requireAuth;

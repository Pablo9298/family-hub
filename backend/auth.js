
/*
 * FAMILY HUB — AUTH ROUTES
 *
 * Здесь будут маршруты:
 * GET /auth/google          — начало входа через Google
 * GET /auth/google/callback — возвращение из Google
 *
 * Пока реализуем только первый маршрут.
 */

const express = require('express');

// Получаем уже настроенное подключение к Google.
const { getGoogleConfig } = require('./googleAuth');

// Находит пользователя по Google ID
// или создаёт нового в PostgreSQL.
const { findOrCreateGoogleUser } = require('./authUsers');

// Создаём отдельный Express Router.
// Он позволяет не загромождать server.js.
const router = express.Router();

// Загружаем функции openid-client v6.
const clientPromise = import('openid-client');


// =====================================================
// GET /auth/google — НАЧАЛО АВТОРИЗАЦИИ
// =====================================================

router.get('/google', async (req, res) => {
    try {
        const client = await clientPromise;
        const config = await getGoogleConfig();

        // PKCE защищает процесс обмена
        // кода авторизации на токены.
        //
        // Для каждого входа создаём новый verifier.
        const codeVerifier = client.randomPKCECodeVerifier();

        // Из verifier получаем challenge,
        // который отправим Google.
        const codeChallenge =
            await client.calculatePKCECodeChallenge(codeVerifier);

        // state помогает защититься от подмены
        // ответа авторизации.
        const state = client.randomState();

        // nonce связывает ID token с попыткой входа.
        const nonce = client.randomNonce();

        // Сохраняем значения в серверной сессии,
        // чтобы проверить их после возвращения из Google.
        req.session.googleAuth = {
            codeVerifier,
            state,
            nonce
        };

        // Формируем адрес авторизации Google.
        const authorizationUrl = client.buildAuthorizationUrl(
            config,
            {
                redirect_uri: process.env.GOOGLE_REDIRECT_URI,

                // Запрашиваем только данные, необходимые
                // для создания аккаунта Family Hub.
                scope: 'openid email profile',

                // Показывать выбор Google-аккаунта при входе.
                prompt: 'select_account',

                code_challenge: codeChallenge,
                code_challenge_method: 'S256',

                state,
                nonce
            }
        );

        // Сначала гарантированно сохраняем сессию
        // в PostgreSQL, затем перенаправляем пользователя.
        req.session.save((error) => {
            if (error) {
                console.error('Session save failed:', error);
                return res.status(500).send('Session error');
            }

            res.redirect(authorizationUrl.href);
        });

    } catch (error) {
        console.error('Google login failed:', error);
        res.status(500).send('Google login unavailable');
    }
});


/*
 * GET /auth/google/callback
 *
 * Google возвращает пользователя сюда после
 * подтверждения входа.
 *
 * На этом этапе мы:
 * 1. Проверяем связь с начатой авторизацией.
 * 2. Обмениваем временный код на токены.
 * 3. Проверяем ID token от Google.
 *
 * Пока НЕ создаём аккаунт и НЕ выполняем вход
 * в Family Hub. Это отдельный следующий шаг.
 */

router.get('/google/callback', async (req, res) => {
    // Получаем данные, сохранённые перед переходом к Google.
    const authData = req.session.googleAuth;

    // Если сессии нет, мы не можем проверить,
    // что пользователь действительно начал вход у нас.
    if (
        !authData?.codeVerifier ||
        !authData?.state ||
        !authData?.nonce
    ) {
        return res.status(400).send(
            'Login session missing. Please start again.'
        );
    }

    // Одноразовые данные нельзя использовать повторно.
    delete req.session.googleAuth;

    try {
        const client = await clientPromise;
        const config = await getGoogleConfig();

        // Восстанавливаем адрес callback с параметрами
        // code и state, которые прислал Google.
        const currentUrl = new URL(
            req.originalUrl,
            new URL(process.env.GOOGLE_REDIRECT_URI).origin
        );

        // Обмениваем код на токены.
        //
        // Библиотека проверяет:
        // - PKCE verifier
        // - state
        // - nonce в ID token
        // - подпись и другие необходимые свойства ID token
        const tokens = await client.authorizationCodeGrant(
            config,
            currentUrl,
            {
                pkceCodeVerifier: authData.codeVerifier,
                expectedState: authData.state,
                expectedNonce: authData.nonce,
                idTokenExpected: true
            }
        );

        // Получаем подтверждённые данные из ID token.
        const claims = tokens.claims();

        if (
            !claims?.sub ||
            !claims?.email ||
            claims.email_verified !== true
        ) {
            return res.status(403).send(
                'Verified Google account required.'
            );
        }


        // Google уже подтвердил личность пользователя.
        // Теперь ищем его в нашей базе Family Hub.
        //
        // Если пользователь входит впервые,
        // функция создаст две связанные записи:
        // users и user_auth_providers.
        const user = await findOrCreateGoogleUser(claims);

        // После успешной авторизации создаём
        // НОВУЮ сессию вместо старой анонимной.
        //
        // Это защита от session fixation —
        // ситуации, когда злоумышленник пытается
        // навязать пользователю известный ID сессии.
        req.session.regenerate((error) => {
            if (error) {
                console.error('Session regeneration failed:', error);
                return res.status(500).send('Session error');
            }

            // Сохраняем только внутренний ID пользователя.
            // Не сохраняем Google access token или ID token.
            req.session.userId = user.id.toString();


            req.session.save((saveError) => {
                if (saveError) {
                    console.error('Session save failed:', saveError);
                    return res.status(500).send('Session error');
                }

                // =====================================================
                // ПЕРЕНАПРАВЛЕНИЕ В ЛИЧНЫЙ КАБИНЕТ
                // =====================================================
                //
                // Google подтвердил пользователя.
                // Мы создали сессию и сохранили её в PostgreSQL.
                //
                // Теперь вместо текстового сообщения отправляем
                // браузер на страницу финансового кабинета.
                //
                // HTTP 302 сообщает браузеру:
                // "Открой указанный адрес".

                return res.redirect(
                    'http://localhost:5500/frontend/dashboard.html'
                );
            });

        });


    } catch (error) {
        // Не выводим токены или authorization code в ответ.
        console.error('Google callback error:', error.message);

        res.status(400).send(
            'Google authentication failed. Please try again.'
        );
    }
});


/*
 * =====================================================
 * GET /auth/me — ПРОВЕРКА АВТОРИЗАЦИИ
 * =====================================================
 *
 * Frontend вызывает этот маршрут при открытии
 * личного кабинета.
 *
 * Если пользователь авторизован:
 * - возвращаем информацию о его аккаунте.
 *
 * Если сессии нет:
 * - возвращаем HTTP 401 Unauthorized.
 *
 * Пользователя определяем по серверной сессии,
 * а не по ID, переданному браузером.
 */

router.get('/me', async (req, res) => {

    // Проверяем, есть ли авторизованный пользователь.
    const userId = req.session?.userId;

    if (!userId) {
        return res.status(401).json({
            error: 'Authentication required'
        });
    }

    try {

        // Загружаем актуальную информацию из PostgreSQL.
        // Не возвращаем Google-токены и секреты.
        const pool = require('./db');

        const result = await pool.query(
            `
            SELECT
                id,
                email,
                display_name
            FROM users
            WHERE id = $1
            `,
            [userId]
        );

        // Сессия может остаться, даже если аккаунт
        // был удалён из базы.
        if (result.rows.length === 0) {
            return res.status(401).json({
                error: 'User not found'
            });
        }

        const user = result.rows[0];

        return res.json({
            id: Number(user.id),
            email: user.email,
            display_name: user.display_name
        });

    } catch (error) {

        console.error('GET /auth/me error:', error);

        return res.status(500).json({
            error: 'Failed to check authentication'
        });
    }
});


/*
 * =====================================================
 * POST /auth/logout — ВЫХОД ИЗ АККАУНТА
 * =====================================================
 *
 * При выходе:
 * 1. Уничтожаем серверную сессию.
 * 2. Удаляем сессионную cookie из браузера.
 *
 * Сам аккаунт Google и данные в PostgreSQL
 * при этом НЕ удаляются.
 */

router.post('/logout', (req, res) => {

    // Уничтожаем сессию на сервере.
    req.session.destroy((error) => {

        if (error) {
            console.error('Logout error:', error);

            return res.status(500).json({
                error: 'Failed to log out'
            });
        }

        // Удаляем cookie с идентификатором сессии.
        // express-session по умолчанию использует connect.sid.
        res.clearCookie('connect.sid', {
            path: '/'
        });

        return res.json({
            message: 'Logged out successfully'
        });
    });
});




module.exports = router;

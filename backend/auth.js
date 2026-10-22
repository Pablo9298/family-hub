
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

            // Гарантируем, что сессия записана
            // в PostgreSQL до ответа браузеру.
            req.session.save((saveError) => {
                if (saveError) {
                    console.error('Session save failed:', saveError);
                    return res.status(500).send('Session error');
                }

                // Пока показываем простой текст,
                // чтобы проверить работу входа.
                // Позже перенаправим на frontend.
                res.type('text/plain').send(
                    'Family Hub login successful!\n' +
                    `User ID: ${user.id}\n` +
                    `Name: ${user.display_name}\n` +
                    `Email: ${user.email}`
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


module.exports = router;

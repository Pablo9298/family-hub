
/*
 * ==========================================================
 * FAMILY HUB — invitations.js
 * ==========================================================
 *
 * Этот модуль отвечает за:
 *
 * 1. Открытие и закрытие меню Google-аккаунта.
 * 2. Получение приглашений через GET /invitations.
 * 3. Отображение колокольчика поверх аватара.
 * 4. Отображение количества приглашений.
 * 5. Вывод карточек приглашений.
 * 6. Принятие приглашений через POST /invitations/:id/accept.
 * 7. Периодическое обновление приглашений.
 *
 * Важно:
 * - Этот код работает только на frontend.
 * - Проверка прав пользователя выполняется на backend.
 * - Запускается через initInvitations() из main.js.
 * - Не подключаем этот файл отдельным тегом <script>.
 */

// Адрес нашего backend в режиме разработки.
const API = 'http://localhost:3001';


/*
 * ==========================================================
 * ИНИЦИАЛИЗАЦИЯ ПРИГЛАШЕНИЙ
 * ==========================================================
 *
 * export позволяет импортировать эту функцию в main.js:
 *
 * import { initInvitations } from './invitations.js';
 *
 * Функция вызывается один раз после успешной авторизации.
 */

export function initInvitations() {

    // ======================================================
    // 1. ПОЛУЧАЕМ ЭЛЕМЕНТЫ ИЗ dashboard.html
    // ======================================================

    // Кнопка-аватар, которая открывает меню аккаунта.
    const avatarButton = document.getElementById('invitations-button');

    // Само модальное окно меню.
    const dialog = document.getElementById('account-menu');

    // Кнопка закрытия меню.
    const closeButton = document.getElementById('close-account-menu');

    // Главный экран меню аккаунта.
    const home = document.getElementById('account-menu-home');

    // Экран со списком приглашений.
    const invitationView = document.getElementById('account-menu-invitations');

    // Контейнер для карточек приглашений.
    const invitationList = document.getElementById('invitations-list');

    // Маленький счётчик поверх аватара.
    const badge = document.getElementById('invitations-count');

    // Количество приглашений внутри меню аккаунта.
    const menuCount = document.getElementById('menu-invitations-count');

    // Кнопка перехода к приглашениям.
    const openInvitationsButton = document.getElementById('open-invitations');

    // Кнопка возвращения в главное меню.
    const backButton = document.getElementById('back-to-account-menu');


    // ======================================================
    // 2. СОСТОЯНИЕ ПРИГЛАШЕНИЙ
    // ======================================================

    // Здесь храним приглашения, полученные от backend.
    let invitations = [];

    // false означает, что первая загрузка ещё не завершена.
    let invitationsLoaded = false;


    // ======================================================
    // 3. ОБНОВЛЕНИЕ КОЛОКОЛЬЧИКА И СЧЁТЧИКА
    // ======================================================

    function updateCount() {

        // Количество ожидающих приглашений.
        const count = invitations.length;

        // Аналогично скрываем числовой индикатор.
        badge.hidden = count === 0;

        // На аватаре показываем максимум "9+".
        badge.textContent = count > 9
            ? '9+'
            : String(count);

        // В меню показываем точное количество.
        menuCount.textContent = String(count);

        // Обновляем доступное описание кнопки.
        // Это полезно для скринридеров.
        avatarButton.setAttribute(
            'aria-label',
            count > 0
                ? `Меню аккаунта. Новых приглашений: ${count}`
                : 'Открыть меню аккаунта'
        );
    }


    // ======================================================
    // 4. ПЕРЕКЛЮЧЕНИЕ ЭКРАНОВ МЕНЮ
    // ======================================================

    function showView(view) {

        // На главном экране показываем пункты меню.
        home.hidden = view !== 'home';

        // На экране приглашений показываем карточки.
        invitationView.hidden = view !== 'invitations';
    }


    // ======================================================
    // 5. ЗАГРУЗКА ПРИГЛАШЕНИЙ С BACKEND
    // ======================================================

    async function loadInvitations() {

        try {

            // GET /invitations использует Google-сессию.
            //
            // Email не отправляем:
            // backend самостоятельно определяет пользователя.
            const response = await fetch(`${API}/invitations`, {
                credentials: 'include'
            });

            // Если сервер вернул ошибку, переходим в catch.
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            // Преобразуем JSON-ответ в JavaScript-данные.
            const data = await response.json();

            // Наш API должен возвращать массив.
            if (!Array.isArray(data)) {
                throw new Error('Некорректный ответ сервера');
            }

            // Сохраняем полученные приглашения.
            invitations = data;

            // Отмечаем, что первая загрузка завершена.
            invitationsLoaded = true;

            // Перерисовываем уведомления на аватаре.
            updateCount();

            // Если пользователь уже открыл приглашения,
            // обновляем список без закрытия окна.
            if (!invitationView.hidden) {
                renderInvitations();
            }

        } catch (error) {

            console.error(
                'Не удалось загрузить приглашения:',
                error
            );

            // Показываем ошибку только на открытом
            // экране приглашений.
            if (!invitationView.hidden) {
                invitationList.textContent =
                    'Не удалось загрузить приглашения. Попробуй позже.';
            }
        }
    }


    // ======================================================
    // 6. ОТОБРАЖЕНИЕ ПРИГЛАШЕНИЙ
    // ======================================================

    function renderInvitations() {

        // Удаляем старые карточки.
        invitationList.replaceChildren();

        // Если загрузка ещё не завершена,
        // показываем сообщение.
        if (!invitationsLoaded) {

            const loading = document.createElement('p');

            loading.className = 'muted';
            loading.textContent = 'Загрузка приглашений...';

            invitationList.append(loading);

            return;
        }

        // Если приглашений нет, показываем пустое состояние.
        if (invitations.length === 0) {

            const empty = document.createElement('p');

            empty.className = 'muted';
            empty.textContent = 'Новых приглашений пока нет.';

            invitationList.append(empty);

            return;
        }

        // Создаём карточку для каждого приглашения.
        for (const invite of invitations) {

            // Основной контейнер карточки.
            const card = document.createElement('div');
            card.className = 'invitation-card';

            // Название финансового пространства.
            const title = document.createElement('h3');
            title.textContent = invite.workspace_name;

            // Имя пользователя, отправившего приглашение.
            const description = document.createElement('p');
            description.className = 'muted';

            description.textContent =
                `${invite.invited_by_name || 'Пользователь'} ` +
                'приглашает тебя присоединиться к пространству.';

            // Кнопка принятия приглашения.
            const acceptButton = document.createElement('button');

            acceptButton.type = 'button';
            acceptButton.className = 'btn btn-primary';
            acceptButton.textContent = 'Принять приглашение';

            // Сообщение о процессе принятия или ошибке.
            const status = document.createElement('p');

            status.setAttribute('role', 'status');


            // ==================================================
            // 7. ПРИНЯТИЕ ПРИГЛАШЕНИЯ
            // ==================================================

            acceptButton.addEventListener('click', async () => {

                // Не допускаем повторных нажатий.
                acceptButton.disabled = true;

                status.textContent = 'Принимаем приглашение...';

                try {

                    // Отправляем ID выбранного приглашения.
                    //
                    // Backend проверит, что приглашение
                    // адресовано текущему Google-аккаунту.
                    const response = await fetch(
                        `${API}/invitations/${encodeURIComponent(invite.id)}/accept`,
                        {
                            method: 'POST',

                            // Передаём серверную сессию.
                            credentials: 'include',

                            headers: {
                                'Content-Type': 'application/json'
                            },

                            body: JSON.stringify({})
                        }
                    );

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    status.textContent =
                        'Приглашение принято! Обновляем пространства...';

                    // Обновляем список ожидающих приглашений.
                    await loadInvitations();

                    // main.js загружает доступные пользователю
                    // пространства при запуске.
                    //
                    // Поэтому перезагружаем страницу:
                    // новое пространство появится в select.
                    window.location.reload();

                } catch (error) {

                    console.error(
                        'Не удалось принять приглашение:',
                        error
                    );

                    status.textContent =
                        'Ошибка принятия приглашения. Попробуй ещё раз.';

                    // Разрешаем попробовать повторно.
                    acceptButton.disabled = false;
                }
            });


            // Добавляем содержимое карточки.
            //
            // Используем textContent и createElement,
            // а не innerHTML с данными пользователей.
            card.append(
                title,
                description,
                acceptButton,
                status
            );

            // Добавляем карточку в общий список.
            invitationList.append(card);
        }
    }


    // ======================================================
    // 8. ОТКРЫТИЕ И ЗАКРЫТИЕ МЕНЮ АККАУНТА
    // ======================================================

    avatarButton.addEventListener('click', () => {

        // При открытии начинаем с главного экрана.
        showView('home');

        // Открываем нативное модальное окно.
        dialog.showModal();

        // Получаем свежие приглашения.
        loadInvitations();
    });


    closeButton.addEventListener('click', () => {
        dialog.close();
    });


    // Нажатие на пункт "Приглашения".
    openInvitationsButton.addEventListener('click', () => {

        // Показываем экран приглашений.
        showView('invitations');

        // Показываем текущие данные.
        renderInvitations();

        // Дополнительно запрашиваем свежие данные.
        loadInvitations();
    });


    // Кнопка "Назад".
    backButton.addEventListener('click', () => {
        showView('home');
    });


    // Закрытие при клике по фону модального окна.
    dialog.addEventListener('click', event => {

        if (event.target === dialog) {
            dialog.close();
        }
    });


    // ======================================================
    // 9. АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ ПРИГЛАШЕНИЙ
    // ======================================================

    // Загружаем приглашения сразу после инициализации.
    loadInvitations();

    // Проверяем новые приглашения раз в минуту.
    setInterval(() => {

        // Не отправляем лишние запросы,
        // когда вкладка браузера скрыта.
        if (!document.hidden) {
            loadInvitations();
        }

    }, 60000);


    // Если пользователь вернулся на вкладку,
    // сразу проверяем новые приглашения.
    document.addEventListener('visibilitychange', () => {

        if (!document.hidden) {
            loadInvitations();
        }
    });
}

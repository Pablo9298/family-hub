
/*
 * =====================================================
 * FAMILY HUB — workspaceMembers.js
 * =====================================================
 *
 * Управление приглашениями через интерфейс.
 *
 * 1. Открываем окно выбранного пространства.
 * 2. Проверяем, является ли пользователь владельцем.
 * 3. Владелец может пригласить человека по email.
 * 4. Backend повторно проверяет права пользователя.
 */

import {
    getCurrentWorkspace,
    getCurrentUser,
    getWorkspaces
} from './api.js';

const API = 'http://localhost:3001';

export function initWorkspaceMembers() {

    // Элементы уже добавленного модального окна.
    const openButton = document.getElementById(
        'workspace-members-button'
    );

    const dialog = document.getElementById(
        'workspace-members-dialog'
    );

    const closeButton = document.getElementById(
        'close-workspace-members'
    );

    const workspaceName = document.getElementById(
        'workspace-members-name'
    );

    // Контейнер для списка участников пространства.
    const membersList = document.getElementById(
        'workspace-members-list'
    );

    const inviteSection = document.getElementById(
        'workspace-invite-section'
    );

    const readonlyMessage = document.getElementById(
        'workspace-members-readonly'
    );

    const form = document.getElementById(
        'workspace-invite-form'
    );

    const emailInput = document.getElementById(
        'workspace-invite-email'
    );

    const submitButton = document.getElementById(
        'workspace-invite-submit'
    );

    const status = document.getElementById(
        'workspace-invite-status'
    );

    // Защита от повторной инициализации.
    if (!openButton || !dialog || openButton.dataset.initialized) {
        return;
    }

    openButton.dataset.initialized = 'true';

    // Кнопку разрешаем использовать.
    // Если workspace ещё не выбран, его проверим при открытии.
    openButton.disabled = false;

    // ID пространства, для которого открыто окно.
    let openedWorkspaceId = null;

    // Может ли текущий пользователь управлять участниками.
    let canManageMembers = false;


    // =====================================================
    // ЗАГРУЗКА УЧАСТНИКОВ ПРОСТРАНСТВА
    // =====================================================

    async function loadWorkspaceMembers(workspaceId) {

        // Убираем список предыдущего пространства.
        membersList.replaceChildren();

        const loading = document.createElement('p');
        loading.className = 'muted';
        loading.textContent = 'Загрузка участников...';

        membersList.append(loading);

        try {

            // Backend проверяет, состоит ли пользователь
            // в выбранном финансовом пространстве.
            const response = await fetch(
                `${API}/workspaces/${encodeURIComponent(workspaceId)}/members`,
                {
                    credentials: 'include'
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const members = await response.json();

            if (!Array.isArray(members)) {
                throw new Error('Неверный формат списка участников');
            }

            // Если пользователь успел открыть другое
            // пространство, старый ответ не показываем.
            if (openedWorkspaceId !== String(workspaceId)) {
                return;
            }

            membersList.replaceChildren();

            if (members.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'muted';
                empty.textContent = 'Участников пока нет';

                membersList.append(empty);
                return;
            }

            // Создаём карточку каждого участника.
            for (const member of members) {

                const card = document.createElement('div');
                card.className = 'workspace-member-card';

                const details = document.createElement('div');
                details.className = 'workspace-member-details';


                // =====================================================
                // АВАТАР УЧАСТНИКА
                // =====================================================

                const avatar = document.createElement('div');
                avatar.className = 'workspace-member-avatar';

                // Используем первую букву имени.
                // Если имени нет, берём первую букву email.
                const displayName =
                    member.display_name || member.email || '?';

                avatar.textContent =
                    displayName.trim().charAt(0).toUpperCase();


                // =====================================================
                // ИМЯ И EMAIL
                // =====================================================

                const name = document.createElement('strong');
                name.textContent = displayName;

                const email = document.createElement('p');
                email.className = 'muted';
                email.textContent = member.email;

                details.append(name, email);


                // =====================================================
                // РОЛЬ УЧАСТНИКА
                // =====================================================

                const role = document.createElement('span');
                role.className = 'workspace-member-role';

                if (member.role === 'owner') {

                    // Компактная корона вместо слова "Владелец".
                    // SVG-корона вместо эмодзи.
                    // Это статическая SVG-разметка, не пользовательские данные.
                    role.innerHTML = `
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                        >
                            <path d="m2 8 5 4 5-7 5 7 5-4-2 11H4L2 8Z"/>
                            <path d="M4 22h16"/>
                        </svg>
                    `;
                    role.title = 'Владелец пространства';
                    role.setAttribute(
                        'aria-label',
                        'Владелец пространства'
                    );

                    role.classList.add('workspace-member-owner');

                } else {

                    role.textContent = 'Участник';

                }


                // Собираем карточку:
                // [Аватар] [Имя и email] [Роль]
                card.append(avatar, details, role);


                // =====================================================
                // УДАЛЕНИЕ УЧАСТНИКА
                // =====================================================

                // Только владелец видит кнопку удаления.
                // Самого владельца удалять нельзя.
                if (canManageMembers && member.role !== 'owner') {

                    const removeButton = document.createElement('button');

                    removeButton.type = 'button';
                    removeButton.className = 'workspace-member-remove icon-button';
                    removeButton.title = 'Удалить участника';
                    removeButton.setAttribute(
                        'aria-label',
                        `Удалить участника ${displayName}`
                    );

                    // SVG-корзина вместо эмодзи.
                    removeButton.innerHTML = `
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                        >
                            <path d="M3 6h18"/>
                            <path d="M8 6V4h8v2"/>
                            <path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v5"/>
                            <path d="M14 11v5"/>
                        </svg>
                    `;

                    removeButton.addEventListener('click', async () => {

                        // Подтверждаем удаление.
                        const confirmed = window.confirm(
                            `Удалить ${displayName} из пространства?`
                        );

                        if (!confirmed) {
                            return;
                        }

                        // Запоминаем пространство на момент нажатия.
                        const workspaceId = openedWorkspaceId;

                        if (!workspaceId) {
                            return;
                        }

                        removeButton.disabled = true;

                        try {

                            const response = await fetch(
                                `${API}/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(member.id)}`,
                                {
                                    method: 'DELETE',
                                    credentials: 'include'
                                }
                            );

                            if (!response.ok) {
                                throw new Error(`HTTP ${response.status}`);
                            }

                            // Заново загружаем актуальный список.
                            await loadWorkspaceMembers(workspaceId);

                        } catch (error) {

                            console.error(
                                'Ошибка удаления участника:',
                                error
                            );

                            if (openedWorkspaceId === workspaceId) {
                                alert('Не удалось удалить участника');
                            }

                            removeButton.disabled = false;
                        }
                    });

                    card.append(removeButton);
                }


                membersList.append(card);

            }

        } catch (error) {

            console.error(
                'Ошибка загрузки участников:',
                error
            );

            // Не показываем ошибку от уже закрытого окна.
            if (openedWorkspaceId !== String(workspaceId)) {
                return;
            }

            membersList.replaceChildren();

            const message = document.createElement('p');
            message.className = 'muted';
            message.textContent =
                'Не удалось загрузить участников';

            membersList.append(message);
        }
    }

    // =====================================================
    // 1. ОТКРЫТИЕ ОКНА
    // =====================================================

    openButton.addEventListener('click', async () => {

        openButton.disabled = true;

        try {

            // Берём актуальный ID, а не фиксированное число.
            const workspaceId = getCurrentWorkspace();

            // Получаем пользователя и список его пространств.
            const [user, workspaces] = await Promise.all([
                getCurrentUser(),
                getWorkspaces()
            ]);

            if (!user) {
                throw new Error('Необходимо войти в аккаунт');
            }

            // Находим выбранное пространство.
            const workspace = workspaces.find(
                item => String(item.id) === String(workspaceId)
            );

            if (!workspace) {
                throw new Error('Пространство не найдено');
            }

            openedWorkspaceId = String(workspace.id);

            workspaceName.textContent = workspace.name;
            emailInput.value = '';
            status.textContent = '';

            // Проверяем владельца.
            // Важно: это только настройка интерфейса.
            // Настоящую проверку прав выполняет backend.
            const isOwner =
                String(workspace.created_by) === String(user.id);

            // Сохраняем права для отображения кнопок удаления.
            canManageMembers = isOwner;

            inviteSection.hidden = !isOwner;
            readonlyMessage.hidden = isOwner;

            dialog.showModal();

            // Загружаем участников выбранного пространства.
            loadWorkspaceMembers(openedWorkspaceId);

        } catch (error) {

            console.error('Ошибка открытия участников:', error);

            alert(error.message || 'Не удалось открыть участников');

        } finally {
            openButton.disabled = false;
        }
    });


    // =====================================================
    // 2. ЗАКРЫТИЕ ОКНА
    // =====================================================

    closeButton.addEventListener('click', () => {
        dialog.close();
    });

    // Сбрасываем ID после закрытия.
    dialog.addEventListener('close', () => {
        openedWorkspaceId = null;
    });


    // =====================================================
    // 3. ОТПРАВКА ПРИГЛАШЕНИЯ
    // =====================================================

    form.addEventListener('submit', async (event) => {

        // Не перезагружаем страницу.
        event.preventDefault();

        if (!openedWorkspaceId) {
            status.textContent = 'Пространство не выбрано';
            return;
        }

        const email = emailInput.value.trim().toLowerCase();

        if (!email || !emailInput.checkValidity()) {
            emailInput.reportValidity();
            return;
        }

        // Защита от повторного нажатия.
        submitButton.disabled = true;
        status.textContent = 'Отправляем приглашение...';

        try {

            const response = await fetch(
                `${API}/workspaces/${encodeURIComponent(openedWorkspaceId)}/invitations`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email })
                }
            );

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    data.error || `HTTP ${response.status}`
                );
            }

            status.textContent =
                `Приглашение для ${email} отправлено!`;

            // Очищаем поле после успешной отправки.
            emailInput.value = '';

        } catch (error) {

            console.error('Ошибка отправки приглашения:', error);

            status.textContent =
                error.message || 'Не удалось отправить приглашение';

        } finally {
            submitButton.disabled = false;
        }
    });
}

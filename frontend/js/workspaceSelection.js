/* ============================================================
 * FAMILY HUB — workspaceSelection.js
 *
 * Одинаковый выбор финансового пространства на разных страницах.
 * sessionStorage действует только в текущей вкладке браузера.
 * Ключ содержит ID пользователя, чтобы аккаунты не смешивались.
 *
 * ВАЖНО: сохранённый ID не предоставляет доступ! Перед применением
 * сравниваем его с GET /workspaces текущего авторизованного пользователя.
 * Доступ к транзакциям всё равно проверяется сервером.
 * ============================================================ */

const storageKey = userId => `familyhub:workspace:${userId}`;

// Выбираем ранее открытое пространство или первое доступное.
export function chooseWorkspace(userId, workspaces) {
    if (!workspaces.length) return null;
    const saved = sessionStorage.getItem(storageKey(userId));
    return workspaces.find(item => String(item.id) === saved) || workspaces[0];
}

// Вызываем после успешного выбора workspace на любой странице.
export function rememberWorkspace(userId, workspaceId) {
    sessionStorage.setItem(storageKey(userId), String(workspaceId));
}

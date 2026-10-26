
/*
 * ==========================================================
 * FAMILY HUB — api.js
 * ==========================================================
 *
 * Этот модуль отвечает за общение frontend с Express.
 *
 * Frontend -> fetch() -> Express -> PostgreSQL
 *
 * Теперь все финансовые операции выполняются
 * внутри определённого workspace.
 *
 * Например:
 * /workspaces/1/transactions
 * /workspaces/1/categories
 *
 * Сервер проверяет:
 * 1. Авторизован ли пользователь.
 * 2. Состоит ли он в указанном пространстве.
 *
 * Важно:
 * credentials: 'include' позволяет браузеру
 * отправлять сессионную cookie вместе с запросом.
 */

// Адрес локального Express backend.
const API_BASE = 'http://localhost:3001';


/*
 * ==========================================================
 * ТЕКУЩЕЕ ФИНАНСОВОЕ ПРОСТРАНСТВО
 * ==========================================================
 *
 * Пока workspace не выбран.
 *
 * После входа frontend загрузит список доступных
 * пространств и выберет нужное.
 */

let currentWorkspaceId = null;


/*
 * Устанавливаем текущее пространство.
 *
 * Например:
 * setCurrentWorkspace(1);
 *
 * В дальнейшем вызовем эту функцию из main.js,
 * когда получим список пространств пользователя.
 */
export function setCurrentWorkspace(workspaceId) {

    // PostgreSQL BIGINT может приходить строкой.
    // Проверяем положительный целочисленный ID.
    const id = String(workspaceId);

    if (!/^[1-9]\d*$/.test(id)) {
        throw new Error('Invalid workspace ID');
    }

    currentWorkspaceId = id;
}


/*
 * Возвращаем выбранное пространство.
 *
 * Если его ещё не выбрали, выбрасываем ошибку,
 * чтобы случайно не отправить запрос по
 * неправильному адресу.
 */
export function getCurrentWorkspace() {

    if (currentWorkspaceId === null) {
        throw new Error('Финансовое пространство ещё не выбрано');
    }

    return currentWorkspaceId;
}


/*
 * Формируем адрес API для текущего пространства.
 *
 * Например:
 * getWorkspaceUrl('transactions')
 *
 * Вернёт:
 * http://localhost:3001/workspaces/1/transactions
 */
function getWorkspaceUrl(resource) {

    const workspaceId = getCurrentWorkspace();

    return `${API_BASE}/workspaces/${workspaceId}/${resource}`;
}



// ==========================================================
// ОБЩАЯ ФУНКЦИЯ ДЛЯ HTTP-ЗАПРОСОВ
// ==========================================================

async function apiFetch(url, options = {}) {

    // Добавляем сессионную cookie к запросу.
    //
    // options позволяет передавать method,
    // headers, body и другие настройки fetch().
    const response = await fetch(url, {
        ...options,
        credentials: 'include'
    });

    return readResponse(response);
}


// ==========================================================
// ОБРАБОТКА HTTP-ОТВЕТОВ
// ==========================================================

async function readResponse(response) {

    // fetch() сам не считает HTTP 400/401/404/500
    // ошибкой JavaScript. Поэтому проверяем response.ok.
    if (!response.ok) {

        // Express может возвращать error или message.
        // Поддерживаем оба варианта.
        const errorBody = await response.json()
            .catch(() => null);

        if (response.status === 401) {
            throw new Error(
                'Сессия отсутствует. Войди через Google.'
            );
        }

        throw new Error(
            errorBody?.error ||
            errorBody?.message ||
            `HTTP ${response.status}`
        );
    }

    // Превращаем JSON-ответ в объект JavaScript.
    return response.json();
}


// ==========================================================
// GET — ПОЛУЧЕНИЕ ТРАНЗАКЦИЙ
// ==========================================================

export async function getTransactions() {

    const transactions = await apiFetch(
        getWorkspaceUrl('transactions')
    );

    if (!Array.isArray(transactions)) {
        throw new Error('Сервер вернул не массив транзакций');
    }

    return transactions;
}


// ==========================================================
// POST — СОЗДАНИЕ ТРАНЗАКЦИИ
// ==========================================================

export async function createTransaction(data) {

    return apiFetch(getWorkspaceUrl('transactions'), {
        method: 'POST',

        headers: {
            'Content-Type': 'application/json'
        },

        // Превращаем JS-объект в JSON-строку.
        body: JSON.stringify(data)
    });
}


// ==========================================================
// PUT — РЕДАКТИРОВАНИЕ ТРАНЗАКЦИИ
// ==========================================================

export async function updateTransaction(id, data) {

    return apiFetch(`${getWorkspaceUrl('transactions')}/${id}`, {
        method: 'PUT',

        headers: {
            'Content-Type': 'application/json'
        },

        body: JSON.stringify(data)
    });
}


// ==========================================================
// DELETE — УДАЛЕНИЕ ТРАНЗАКЦИИ
// ==========================================================

export async function deleteTransaction(id) {

    return apiFetch(`${getWorkspaceUrl('transactions')}/${id}`, {
        method: 'DELETE'
    });
}


// ==========================================================
// GET — ПОЛУЧЕНИЕ КАТЕГОРИЙ
// ==========================================================

export async function getCategories() {

    const categories = await apiFetch(
        getWorkspaceUrl('categories')
    );

    if (!Array.isArray(categories)) {
        throw new Error('Сервер вернул не массив категорий');
    }

    return categories;
}


/*
 * ==========================================================
 * GET /workspaces
 * ==========================================================
 *
 * Загружаем финансовые пространства,
 * к которым текущий пользователь имеет доступ.
 *
 * Не передаём userId вручную!
 * Backend определяет пользователя по Google-сессии.
 */

export async function getWorkspaces() {

    const workspaces = await apiFetch(
        `${API_BASE}/workspaces`
    );

    // Проверяем формат ответа сервера.
    if (!Array.isArray(workspaces)) {
        throw new Error(
            'Сервер вернул не массив пространств'
        );
    }

    return workspaces;
}


/*
 * ==========================================================
 * POST /workspaces — СОЗДАНИЕ ФИНАНСОВОГО ПРОСТРАНСТВА
 * ==========================================================
 *
 * data = { name: 'Личный бюджет' }
 *
 * Backend:
 * 1. Определяет пользователя по Google-сессии.
 * 2. Создаёт запись в таблице workspaces.
 * 3. Добавляет создателя в workspace_members.
 * 4. Возвращает созданное пространство.
 */

export async function createWorkspace(name) {

    // Отправляем запрос через нашу общую функцию.
    // apiFetch автоматически добавит credentials: 'include'.
    return apiFetch(`${API_BASE}/workspaces`, {

        method: 'POST',

        headers: {
            'Content-Type': 'application/json'
        },

        // Преобразуем название в JSON.
        body: JSON.stringify({
            name: name
        })
    });
}


/*
 * POST /auth/logout
 *
 * Просим backend уничтожить текущую сессию.
 */

export async function logout() {

    return apiFetch(`${API_BASE}/auth/logout`, {
        method: 'POST'
    });
}

/*
 * =====================================================
 * GET /auth/me — ПРОВЕРКА ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ
 * =====================================================
 *
 * Проверяем сессию через Express.
 *
 * 200 — пользователь авторизован.
 * 401 — пользователь не авторизован.
 *
 * Другие ошибки передаём дальше,
 * чтобы не путать недоступный сервер с выходом.
 */

export async function getCurrentUser() {

    const response = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include'
    });

    if (response.status === 401) {
        return null;
    }

    return readResponse(response);
}
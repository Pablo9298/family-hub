/* ==========================================================
   FAMILY HUB — api.js
   Единственная задача этого файла: общаться с backend Express.

   Цепочка данных:
   браузер -> fetch() -> http://localhost:3001/transactions
           -> Express -> PostgreSQL -> ответ JSON -> браузер.

   Здесь нет HTML, кнопок и логики фильтров.
   Поэтому позже можно изменить адрес API в одном месте.
   ========================================================== */

// Сейчас backend запускается локально на порту 3001.
// Перед публичным релизом адрес нужно будет сделать настраиваемым.
// Один базовый адрес для всех маршрутов backend.
const API_BASE = 'http://localhost:3001';
const API_URL = `${API_BASE}/transactions`;

// Вспомогательная функция для обработки HTTP-ошибок.
// fetch() НЕ бросает ошибку автоматически при ответах 400/404/500:
// он возвращает Response, у которого response.ok === false.
async function readResponse(response) {
    if (!response.ok) {
        // Пытаемся прочитать сообщение, которое отправил Express.
        // Если ответ не JSON, не ломаемся на его разборе.
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.message || `HTTP ${response.status}`);
    }

    // .json() превращает JSON-строку ответа в JS-массив или объект.
    return response.json();
}

// GET /transactions: загружаем массив всех транзакций.
export async function getTransactions() {
    const response = await fetch(API_URL);
    const transactions = await readResponse(response);

    // Backend по договорённости должен вернуть массив.
    if (!Array.isArray(transactions)) {
        throw new Error('Сервер вернул не массив транзакций');
    }

    return transactions;
}

// POST /transactions: отправляем новую транзакцию в формате JSON.
// data = {date, desc, amount, category, type}.
export async function createTransaction(data) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data) // JS-объект -> JSON-строка для HTTP.
    });

    return readResponse(response); // Backend возвращает созданную запись (201).
}

// PUT /transactions/:id: меняем существующую транзакцию.
// id находится в URL, новые поля — в теле JSON-запроса.
export async function updateTransaction(id, data) {
    const response = await fetch(`${API_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    return readResponse(response);
}

// DELETE /transactions/:id: удаляем транзакцию по ID.
export async function deleteTransaction(id) {
    const response = await fetch(`${API_URL}/${id}`, {
        method: 'DELETE'
    });

    return readResponse(response);
}

// GET /categories: получаем все категории из PostgreSQL.
// Ответ: [{ id: 1, name: 'продукты', type: 'expense' }, ...].
// Категории загружаются один раз при запуске и после изменения транзакций.
export async function getCategories() {
    const response = await fetch(`${API_BASE}/categories`);
    const categories = await readResponse(response);

    // Не позволяем некорректному ответу сервера попасть в UI.
    if (!Array.isArray(categories)) {
        throw new Error('Сервер вернул не массив категорий');
    }

    return categories;
}

/* ==========================================================
   FAMILY HUB — main.js
   Точка входа в frontend: связывает HTML, события и модули.

   Важная идея модулей:
   import { имя } from './файл.js' берёт экспортированную функцию.
   Мы НЕ подключаем каждый JS-файл через отдельный <script>.
   В index.html подключаем только main.js с type="module";
   браузер сам загрузит нужные импортируемые файлы.

   Пользователь -> событие HTML -> main.js -> api.js -> Express.
   После успеха: loadTransactions() -> renderTransactions() -> DOM.
   ========================================================== */

import { createTransaction, updateTransaction, deleteTransaction } from './api.js';
import { $, money, showToast, initTheme } from './ui.js';
import { formatDate, initFilters } from './filters.js';
import { loadTransactions, renderTransactions, findTransaction } from './transactions.js';

// ID транзакций, над которыми сейчас открыто модальное окно.
// null = редактирование/удаление сейчас не выбрано.
let editingTransactionId = null;
let deletingTransactionId = null;

// Проверяем значения обеих форм одинаковым способом.
// Эти проверки помогают UX, но backend обязан валидировать всё повторно.
function isValidTransaction(data) {
    return Boolean(
        data.date &&
        data.desc &&
        data.category &&
        Number.isFinite(data.amount) &&
        data.amount > 0 &&
        ['income', 'expense'].includes(data.type)
    );
}

// Получаем значения полей из конкретной формы.
// Для редактирования prefix = 'edit-', для добавления = ''.
function readForm(prefix = '') {
    const amountValue = $(`${prefix}amount`).value;
    const typeName = prefix ? 'edit-type' : 'type';

    return {
        date: $(`${prefix}date`).value, // HTML <input type="date"> -> YYYY-MM-DD.
        desc: $(`${prefix}desc`).value.trim(), // Убираем пробелы по краям.
        amount: amountValue.trim() === '' ? NaN : Number(amountValue),
        category: $(`${prefix}category`).value.trim(),
        type: document.querySelector(`input[name="${typeName}"]:checked`)?.value
    };
}

// ========= 1. ДОБАВЛЕНИЕ: POST /transactions =========
async function addTransaction() {
    const data = readForm();
    if (!isValidTransaction(data)) {
        showToast('Заполни все поля корректно', 'error');
        return;
    }

    try {
        await createTransaction(data); // api.js отправит POST и дождётся ответа.
        $('desc').value = '';
        $('amount').value = '';
        $('category').value = '';
        await loadTransactions(); // Получаем свежие записи из PostgreSQL.
        showToast('Операция добавлена');
    } catch (error) {
        console.error('POST:', error);
        showToast('Не удалось добавить или обновить список операций', 'error');
    }
}

// ========= 2. УДАЛЕНИЕ: диалог + DELETE /transactions/:id =========
function openDeleteDialog(id) {
    // Не делаем лишний GET: запись уже находится в transactions.js.
    const transaction = findTransaction(id);
    if (!transaction) {
        showToast('Запись не найдена', 'error');
        return;
    }

    deletingTransactionId = id;
    $('delete-description').textContent =
        `Удалить «${transaction.desc}» (${money(Number(transaction.amount))})? ` +
        'Это действие нельзя отменить.';
    $('delete-dialog').showModal(); // Нативное модальное окно браузера.
}

async function confirmDelete() {
    if (deletingTransactionId === null) return;
    const id = deletingTransactionId; // Запоминаем ID до закрытия окна.

    try {
        await deleteTransaction(id);
        $('delete-dialog').close();
        await loadTransactions();
        showToast('Операция удалена');
    } catch (error) {
        console.error('DELETE:', error);
        showToast('Не удалось удалить или обновить список операций', 'error');
    }
}

// ========= 3. РЕДАКТИРОВАНИЕ: диалог + PUT /transactions/:id =========
function openEditDialog(id) {
    const transaction = findTransaction(id);
    if (!transaction) {
        showToast('Транзакция не найдена', 'error');
        return;
    }

    editingTransactionId = id;
    // Заполняем форму значениями уже существующей записи.
    $('edit-date').value = transaction.date;
    $('edit-desc').value = transaction.desc;
    $('edit-amount').value = transaction.amount;
    $('edit-category').value = transaction.category;

    // Выбираем соответствующую радиокнопку — Расход либо Доход.
    const editTypeInput = document.querySelector(
        `input[name="edit-type"][value="${transaction.type}"]`
    );
    if (editTypeInput) editTypeInput.checked = true;

    $('edit-dialog').showModal();
}

async function saveEdit() {
    if (editingTransactionId === null) return;
    const data = readForm('edit-');

    if (!isValidTransaction(data)) {
        showToast('Заполни все поля корректно', 'error');
        return;
    }

    try {
        await updateTransaction(editingTransactionId, data);
        $('edit-dialog').close();
        await loadTransactions();
        showToast('Изменения сохранены');
    } catch (error) {
        console.error('PUT:', error);
        showToast('Не удалось сохранить или обновить изменения', 'error');
    }
}

// ========= 4. НАСТРАИВАЕМ ОБРАБОТЧИКИ СОБЫТИЙ =========
function initTransactionEvents() {
    // submit — отправка формы по кнопке или Enter.
    // preventDefault() отменяет стандартную перезагрузку страницы.
    $('add-form').addEventListener('submit', (event) => {
        event.preventDefault();
        addTransaction();
    });

    $('edit-form').addEventListener('submit', (event) => {
        event.preventDefault();
        saveEdit();
    });

    // Делегирование: элементы списка создаются заново через innerHTML.
    // Слушаем общий родитель #transaction-list, а не каждую кнопку.
    $('transaction-list').addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button || !$('transaction-list').contains(button)) return;

        const id = Number(button.dataset.id); // data-id из HTML -> число.
        if (!Number.isSafeInteger(id) || id <= 0) return;

        if (button.dataset.action === 'edit') openEditDialog(id);
        if (button.dataset.action === 'delete') openDeleteDialog(id);
    });

    $('cancel-delete').addEventListener('click', () => $('delete-dialog').close());
    $('confirm-delete').addEventListener('click', confirmDelete);
    $('delete-dialog').addEventListener('close', () => {
        deletingTransactionId = null;
    });

    $('cancel-edit').addEventListener('click', () => $('edit-dialog').close());
    $('close-edit').addEventListener('click', () => $('edit-dialog').close());
    $('edit-dialog').addEventListener('close', () => {
        editingTransactionId = null;
    });
}

// ========= 5. ЗАПУСК ПРИЛОЖЕНИЯ =========
async function initApp() {
    initTheme(); // Подключаем кнопку переключения темы.

    // Ставим в форме добавления сегодняшнюю ЛОКАЛЬНУЮ дату.
    $('date').value = formatDate(new Date());

    // При изменении фильтров вызываем renderTransactions() без GET.
    initFilters(renderTransactions);
    initTransactionEvents();

    try {
        await loadTransactions(); // Первый GET при открытии страницы.
    } catch (error) {
        console.error('Первоначальная загрузка:', error);
        showToast('Не удалось загрузить операции. Проверь сервер.', 'error');
    }
}

// <script type="module"> запускается после разбора HTML.
// Поэтому элементы с id уже доступны для document.getElementById().
initApp();

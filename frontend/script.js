// Family Hub: интерфейс, API и действия с транзакциями
const API_URL = 'http://localhost:3001/transactions';
let editingTransactionId = null;
let deletingTransactionId = null;
const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR' }).format(value);

// Данные, введённые пользователем, нельзя вставлять в HTML без экранирования
function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

// Универсальные ненавязчивые уведомления вместо alert()
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'error' : ''}`;
    toast.setAttribute('role', 'status');
    toast.textContent = `${type === 'error' ? '⚠' : '✓'} ${message}`;
    $('toast-container').appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// Переключатель темы + сохранение выбора на этом устройстве
function updateThemeButton() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('theme-toggle').textContent = dark ? '☀' : '☾';
    $('theme-toggle').setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
}
$('theme-toggle').addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem('familyhub-theme', nextTheme);
    updateThemeButton();
});
updateThemeButton();

const today = new Date();
$('date').value = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');

// GET: загружаем записи и заново собираем список, месяцы и сводку
async function loadTransactions() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Ошибка загрузки');
        const transactions = await response.json();
        if (!Array.isArray(transactions)) throw new Error('Сервер вернул не массив транзакций');

        const groups = {};
        let totalOverall = 0;
        let thisMonthTotal = 0;
        const currentMonth = $('date').value.substring(0, 7);
        // Месяц сводки — именно сегодняшний, не выбранная в форме дата
        const realMonth = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0')].join('-');

        for (const t of transactions) {
            const key = String(t.date).substring(0, 7);
            (groups[key] ||= []).push(t);
            totalOverall += Number(t.amount);
            if (key === realMonth) thisMonthTotal += Number(t.amount);
        }

        $('summary-balance').textContent = money(totalOverall);
        $('summary-count').textContent = String(transactions.length);
        $('summary-month').textContent = money(thisMonthTotal);
        $('summary-month-name').textContent = new Intl.DateTimeFormat('ru-RU', {month:'long',year:'numeric'}).format(today);
        $('total').textContent = `Общий итог: ${money(totalOverall)}`;

        if (!transactions.length) {
            $('transaction-list').innerHTML = '<div class="empty-state">Пока нет записей. Добавь первую операцию слева.</div>';
            return;
        }

        let html = '';
        for (const monthKey of Object.keys(groups).sort().reverse()) {
            const monthTransactions = groups[monthKey].sort((a,b) => b.date.localeCompare(a.date));
            const [year,month] = monthKey.split('-');
            const monthTitle = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(Number(year),Number(month)-1,1));
            let monthTotal = 0;
            html += `<div class="month-block"><h3>📅 ${escapeHTML(monthTitle)}</h3>`;
            for (const t of monthTransactions) {
                const value = Number(t.amount);
                monthTotal += value;
                const dateLabel = String(t.date).split('-').reverse().join('.');
                html += `
                    <div class="transaction-item">
                        <div class="transaction-info">
                            <strong>${escapeHTML(t.desc)}</strong>
                            <div class="transaction-meta">${escapeHTML(dateLabel)} · ${escapeHTML(t.category)}</div>
                        </div>
                        <span class="transaction-amount ${value < 0 ? 'negative' : value > 0 ? 'positive' : ''}">${money(value)}</span>
                        <div class="transaction-actions">
                            <button type="button" class="action-button edit" data-action="edit" data-id="${Number(t.id)}" aria-label="Редактировать">✎ Изменить</button>
                            <button type="button" class="action-button delete" data-action="delete" data-id="${Number(t.id)}" aria-label="Удалить">✕ Удалить</button>
                        </div>
                    </div>`;
            }
            html += `<div class="month-total"><span>Итого за месяц</span><strong>${money(monthTotal)}</strong></div></div>`;
        }
        $('transaction-list').innerHTML = html;
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        showToast('Не удалось загрузить операции. Проверь сервер.', 'error');
    }
}

// Кнопки в динамическом списке: обработчик на родительском контейнере
$('transaction-list').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = Number(button.dataset.id);
    if (button.dataset.action === 'edit') openEditDialog(id);
    if (button.dataset.action === 'delete') openDeleteDialog(id);
});

// POST: добавление
$('add-form').addEventListener('submit', (event) => {
    event.preventDefault();
    addTransaction();
});
async function addTransaction() {
    const date = $('date').value;
    const desc = $('desc').value.trim();
    const amountValue = $('amount').value;
    const amount = Number(amountValue);
    const category = $('category').value.trim();
    if (!date || !desc || amountValue === '' || !Number.isFinite(amount) || !category) {
        showToast('Заполни все поля корректно', 'error'); return;
    }
    try {
        const response = await fetch(API_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({date,desc,amount,category})
        });
        if (!response.ok) throw new Error('Ошибка добавления');
        $('desc').value = ''; $('amount').value = ''; $('category').value = '';
        await loadTransactions();
        showToast('Операция добавлена');
    } catch (error) { console.error(error); showToast('Не удалось добавить операцию', 'error'); }
}

// DELETE: собственное окно подтверждения
async function openDeleteDialog(id) {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Ошибка загрузки');
        const transactions = await response.json();
        const transaction = transactions.find(t => t.id === id);
        if (!transaction) { showToast('Запись не найдена', 'error'); return; }
        deletingTransactionId = id;
        $('delete-description').textContent = `Удалить «${transaction.desc}» (${money(Number(transaction.amount))})? Это действие нельзя отменить.`;
        $('delete-dialog').showModal();
    } catch (error) { console.error(error); showToast('Не удалось открыть удаление', 'error'); }
}
$('cancel-delete').addEventListener('click', () => $('delete-dialog').close());
$('delete-dialog').addEventListener('close', () => { deletingTransactionId = null; });
$('confirm-delete').addEventListener('click', async () => {
    if (deletingTransactionId === null) return;
    const id = deletingTransactionId;
    try {
        const response = await fetch(`${API_URL}/${id}`, {method:'DELETE'});
        if (!response.ok) throw new Error('Ошибка удаления');
        $('delete-dialog').close();
        await loadTransactions();
        showToast('Операция удалена');
    } catch(error) { console.error(error); showToast('Не удалось удалить операцию', 'error'); }
});

// PUT: открытие модального окна с существующими значениями
async function openEditDialog(id) {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Ошибка загрузки');
        const transactions = await response.json();
        const transaction = transactions.find(t => t.id === id);
        if (!transaction) { showToast('Транзакция не найдена', 'error'); return; }
        editingTransactionId = id;
        $('edit-date').value = transaction.date;
        $('edit-desc').value = transaction.desc;
        $('edit-amount').value = transaction.amount;
        $('edit-category').value = transaction.category;
        $('edit-dialog').showModal();
    } catch (error) { console.error(error); showToast('Не удалось открыть редактирование', 'error'); }
}
$('cancel-edit').addEventListener('click', () => $('edit-dialog').close());
$('close-edit').addEventListener('click', () => $('edit-dialog').close());
$('edit-dialog').addEventListener('close', () => { editingTransactionId = null; });
$('edit-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (editingTransactionId === null) return;
    const date = $('edit-date').value;
    const desc = $('edit-desc').value.trim();
    const amountValue = $('edit-amount').value;
    const amount = Number(amountValue);
    const category = $('edit-category').value.trim();
    if (!date || !desc || amountValue === '' || !Number.isFinite(amount) || !category) {
        showToast('Заполни все поля корректно', 'error'); return;
    }
    try {
        const response = await fetch(`${API_URL}/${editingTransactionId}`, {
            method:'PUT', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({date,desc,amount,category})
        });
        if (!response.ok) throw new Error('Ошибка обновления');
        $('edit-dialog').close();
        await loadTransactions();
        showToast('Изменения сохранены');
    } catch(error) { console.error(error); showToast('Не удалось сохранить изменения', 'error'); }
});

loadTransactions();

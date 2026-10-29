/* ==========================================================
   FAMILY HUB — transactions.js
   Хранение загруженного списка, расчёт сводки, HTML истории.

   Важно различать:
   1) allTransactions — все записи, полученные с backend;
   2) periodTransactions — записи выбранного периода;
   3) visibleTransactions — записи периода + выбранного типа.

   Верхние три карточки зависят только от ПЕРИОДА,
   а переключатель «Все / Расходы / Доходы» меняет ИСТОРИЮ.
   ========================================================== */

import { getTransactions, getCurrentWorkspace } from './api.js';
import { $, money, escapeHTML } from './ui.js';
import { getSelectedDateRange, getSelectedType, filterByPeriod } from './filters.js';
import { calculateExpenseCategories, renderExpenseChart } from './analytics.js';

// Это локальная переменная модуля, а не глобальная переменная окна.
// Она сохраняется между вызовами функций, пока открыта страница.
let allTransactions = [];


/*
 * =====================================================
 * ОЧИСТКА ТРАНЗАКЦИЙ ПРИ СМЕНЕ WORKSPACE
 * =====================================================
 *
 * При переключении финансового пространства
 * удаляем из памяти операции предыдущего.
 *
 * Например:
 *
 * Наша семья -> Мотосервис
 *
 * Старые семейные операции не должны отображаться
 * даже во время загрузки данных мотосервиса.
 */

export function clearTransactions() {

    // Делает все предыдущие загрузки устаревшими.
    transactionsLoadVersion++;

    // Очищаем локальный массив.
    // Данные в PostgreSQL при этом НЕ удаляются.
    allTransactions = [];

    // Обновляем историю и верхние карточки.
    renderTransactions();
}



// Счётчик запросов помогает игнорировать
// ответы от более ранних загрузок.
let transactionsLoadVersion = 0;

export async function loadTransactions() {

    // Запоминаем текущую версию запроса
    // и пространство, для которого загружаем данные.
    const version = ++transactionsLoadVersion;
    const workspaceId = getCurrentWorkspace();

    // Выполняем запрос к backend.
    const transactions = await getTransactions();

    // Если во время ожидания сменилось пространство
    // или начался более новый запрос,
    // не записываем устаревший результат.
    if (
        version !== transactionsLoadVersion ||
        workspaceId !== getCurrentWorkspace()
    ) {
        return;
    }

    allTransactions = transactions;
    renderTransactions();
}


// Ищем запись в уже загруженном массиве по ID.
// find() возвращает объект или undefined, если записи нет.
export function findTransaction(id) {
    return allTransactions.find(t => Number(t.id) === Number(id));
}

// Возвращаем сумму со знаком для отображения и расчётов.
// В PostgreSQL amount положительное, а направление хранится в type.
function getSignedAmount(transaction) {
    const amount = Number(transaction.amount);
    return transaction.type === 'expense' ? -amount : amount;
}

// Название месяца из строки YYYY-MM (например, 2026-10).
function getMonthTitle(monthKey) {
    const [year, month] = monthKey.split('-');
    return new Intl.DateTimeFormat('ru-RU', {
        month: 'long', year: 'numeric'
    }).format(new Date(Number(year), Number(month) - 1, 1));
}

// Обновляем верхние карточки: они показывают весь ВЫБРАННЫЙ ПЕРИОД.
function renderSummary(periodTransactions) {
    let totalIncome = 0;
    let totalExpenses = 0;

    for (const transaction of periodTransactions) {
        const amount = Number(transaction.amount);

        if (transaction.type === 'income') totalIncome += amount;
        if (transaction.type === 'expense') totalExpenses += amount;
    }

    $('summary-income').textContent = money(totalIncome);
    $('summary-expenses').textContent = money(totalExpenses);
    $('summary-balance').textContent = money(totalIncome - totalExpenses);
}

// Создаём HTML ОДНОЙ строки истории.
// escapeHTML() нужен для desc и category, введённых пользователем.
// HTML создаётся строкой, затем добавляется через innerHTML.
function transactionHTML(transaction) {
    const signedAmount = getSignedAmount(transaction);
    const dateLabel = String(transaction.date).split('-').reverse().join('.');
    const id = Number(transaction.id);

    return `
        <div class="transaction-item">
            <div class="transaction-info">
                <strong>${escapeHTML(transaction.desc)}</strong>
                <div class="transaction-meta">
                    ${escapeHTML(dateLabel)} · ${escapeHTML(transaction.category)}
                </div>
            </div>

            <span class="transaction-amount ${signedAmount < 0 ? 'negative' : 'positive'}">
                ${money(signedAmount)}
            </span>

            <div class="transaction-actions">
                <button type="button" class="action-button edit"
                    data-action="edit" data-id="${id}" aria-label="Редактировать">
                    ✎ Изменить
                </button>
                <button type="button" class="action-button delete"
                    data-action="delete" data-id="${id}" aria-label="Удалить">
                    ✕ Удалить
                </button>
            </div>
        </div>`;
}

// Перерисовка без сетевых запросов: вызывается при выборе фильтров.
export function renderTransactions() {
    const { from, to } = getSelectedDateRange();
    const selectedType = getSelectedType();

    // Не показываем вводящий в заблуждение итог для обратного интервала.
    if (from && to && from > to) {
        // Убираем старую диаграмму при неправильном диапазоне дат.
        renderExpenseChart({
            totalExpenses: 0,
            categories: []
        });
        $('summary-income').textContent = '—';
        $('summary-expenses').textContent = '—';
        $('summary-balance').textContent = '—';
        $('total').textContent = 'Проверь выбранный период';
        $('transaction-list').innerHTML =
            '<div class="empty-state">Дата «С» должна быть раньше даты «По».</div>';
        return;
    }

    // filter() создаёт новый массив; исходный allTransactions не меняется.
    const periodTransactions = filterByPeriod(allTransactions, from, to);
    const visibleTransactions = periodTransactions.filter(transaction =>
        selectedType === 'all' || transaction.type === selectedType
    );

    // Обновляем верхние карточки с балансом, доходами и расходами.
    renderSummary(periodTransactions);

    // Рассчитываем расходы по категориям за выбранный период.
    const expenseAnalytics = calculateExpenseCategories(periodTransactions);

    // Рисуем диаграмму на Dashboard.
    renderExpenseChart(expenseAnalytics);

    // Объект groups: ключ = '2026-10', значение = массив операций месяца.
    const groups = {};
    for (const transaction of visibleTransactions) {
        const month = String(transaction.date).substring(0, 7);
        (groups[month] ||= []).push(transaction);
    }

    let html = '';

    // Object.keys() достаёт месяцы, sort() сортирует по возрастанию,
    // reverse() разворачивает: новый месяц будет первым.
    for (const monthKey of Object.keys(groups).sort().reverse()) {
        // [...groups[monthKey]] создаёт копию, чтобы sort() не менял
        // исходный порядок данных в нашем кеше.
        const monthTransactions = [...groups[monthKey]].sort((a, b) =>
            String(b.date).localeCompare(String(a.date))
        );

        let monthTotal = 0;
        html += `<div class="month-block"><h3>📅 ${escapeHTML(getMonthTitle(monthKey))}</h3>`;

        for (const transaction of monthTransactions) {
            monthTotal += getSignedAmount(transaction);
            html += transactionHTML(transaction);
        }

        html += `
            <div class="month-total">
                <span>Итого за месяц</span>
                <strong>${money(monthTotal)}</strong>
            </div>
        </div>`;
    }

    $('transaction-list').innerHTML = html ||
        '<div class="empty-state">Нет операций по выбранным фильтрам.</div>';

    // reduce() проходит по видимым строкам, накапливая общий результат.
    // Это сумма только текущего списка, а НЕ показатель верхних карточек.
    const visibleTotal = visibleTransactions.reduce((sum, transaction) =>
        sum + getSignedAmount(transaction), 0
    );
    $('total').textContent = `Итого по выбранным операциям: ${money(visibleTotal)}`;
}

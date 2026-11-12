/* ============================================================
 * FAMILY HUB — analyticsPage.js
 *
 * Точка входа ТОЛЬКО для analytics.html.
 * Не импортируем main.js: он ожидает форму транзакций и модалки
 * Dashboard, которых на странице аналитики нет.
 *
 * Порядок работы:
 *   1. Проверить авторизацию через /auth/me.
 *   2. Получить разрешённые пользователю пространства.
 *   3. Восстановить выбор (лишь если он есть в списке доступа).
 *   4. Получить операции выбранного пространства из PostgreSQL.
 *   5. Рассчитать и нарисовать оба графика без изменения БД.
 * ============================================================ */

import {
    getCurrentUser, getWorkspaces, setCurrentWorkspace,
    getTransactions, logout
} from './api.js';
import { $, initTheme, showToast } from './ui.js';
import { filterByPeriod, formatDate } from './filters.js';
import { calculateExpenseCategories, renderExpenseChart,
    calculateMonthlyStatistics, renderMonthlyChart } from './analytics.js';
import { chooseWorkspace, rememberWorkspace } from './workspaceSelection.js';

let currentUserId = null;
let transactions = [];
let loadVersion = 0; // Защита от устаревших ответов при быстром переключении.

// Возвращает даты в формате YYYY-MM-DD или null (без ограничения).
function selectedRange() {
    const period = $('analytics-period').value;
    if (period === 'all') return { from: null, to: null };
    if (period === 'custom') {
        return {
            from: $('analytics-date-from').value || null,
            to: $('analytics-date-to').value || null
        };
    }
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - (period === 'previous' ? 1 : 0), 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    return { from: formatDate(first), to: formatDate(last) };
}

function render() {
    const view = $('analytics-view').value;
    $('analytics-container').hidden = view === 'monthly';
    $('monthly-analytics-container').hidden = view === 'categories';

    const { from, to } = selectedRange();
    if (from && to && from > to) {
        // Убираем устаревшее кольцо, не показываем ложных сумм.
        $('expense-chart').replaceChildren();
        $('expense-legend').replaceChildren();
        $('expense-chart').textContent = 'Дата «С» должна быть раньше даты «По».';
    } else {
        const periodTransactions = filterByPeriod(transactions, from, to);
        renderExpenseChart(calculateExpenseCategories(periodTransactions));
    }
    // Месячный отчёт намеренно НЕ зависит от фильтра периода.
    renderMonthlyChart(calculateMonthlyStatistics(transactions));
}

async function loadWorkspace(workspaceId) {
    const version = ++loadVersion;
    setCurrentWorkspace(workspaceId);
    rememberWorkspace(currentUserId, workspaceId);
    const select = $('analytics-workspace-select');
    select.disabled = true;
    $('analytics-status').textContent = 'Загрузка операций...';
    transactions = []; // Не показываем данные предыдущего workspace во время загрузки.
    render();
    try {
        const data = await getTransactions();
        if (version !== loadVersion) return;
        transactions = data;
        $('analytics-status').textContent = '';
        render();
    } catch (error) {
        if (version !== loadVersion) return;
        console.error('Analytics transactions:', error);
        $('analytics-status').textContent = 'Не удалось загрузить операции.';
        showToast('Ошибка загрузки аналитики', 'error');
    } finally {
        if (version === loadVersion) select.disabled = false;
    }
}

async function initAnalyticsPage() {
    initTheme();
    $('analytics-period').addEventListener('change', () => {
        $('analytics-custom-range').hidden = $('analytics-period').value !== 'custom';
        render();
    });
    $('analytics-date-from').addEventListener('change', render);
    $('analytics-date-to').addEventListener('change', render);
    $('analytics-view').addEventListener('change', render);

    $('logout-button').addEventListener('click', async () => {
        $('logout-button').disabled = true;
        try {
            await logout();
            window.location.replace('./index.html');
        } catch (error) {
            showToast('Не удалось выйти из аккаунта', 'error');
            $('logout-button').disabled = false;
        }
    });

    try {
        const user = await getCurrentUser();
        if (!user) {
            window.location.replace('./index.html');
            return;
        }
        currentUserId = user.id;
        $('analytics-user-name').textContent = user.display_name || user.email;
        const workspaces = await getWorkspaces();
        const select = $('analytics-workspace-select');
        select.replaceChildren();
        if (!workspaces.length) {
            $('analytics-status').textContent = 'Нет доступных финансовых пространств. Создай их на главной странице.';
            return;
        }
        for (const workspace of workspaces) {
            const option = document.createElement('option');
            option.value = String(workspace.id);
            option.textContent = workspace.name;
            select.appendChild(option);
        }
        const workspace = chooseWorkspace(currentUserId, workspaces);
        select.value = String(workspace.id);
        select.addEventListener('change', () => loadWorkspace(select.value));
        await loadWorkspace(workspace.id);
    } catch (error) {
        console.error('Analytics initialization:', error);
        $('analytics-status').textContent = 'Не удалось открыть аналитику. Проверь сервер и авторизацию.';
        showToast('Не удалось загрузить страницу', 'error');
    }
}

initAnalyticsPage();

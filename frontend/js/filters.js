/* ==========================================================
   FAMILY HUB — filters.js
   Работа с периодами и переключателями фильтрации.
   Здесь нет запросов к серверу: только значения HTML-полей
   и отбор массива, который мы уже получили из API.
   ========================================================== */

import { $ } from './ui.js';

// Переводим JS Date в локальную дату YYYY-MM-DD.
// Не используем toISOString(): UTC может сдвигать календарный день.
export function formatDate(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

// Определяем границы периода по выбранным радиокнопкам.
// Результат всегда объект {from, to}, где null = нет границы.
export function getSelectedDateRange() {
    // :checked ищет выбранную радиокнопку данной группы.
    // ?.value безопасно даёт undefined, если элемент не найден.
    const period = document.querySelector(
        'input[name="filter-period"]:checked'
    )?.value;

    if (period === 'all') {
        return { from: null, to: null }; // Показываем всё время.
    }

    if (period === 'custom') {
        return {
            from: $('filter-date-from').value || null,
            to: $('filter-date-to').value || null
        };
    }

    // По умолчанию — текущий месяц. Для previous отнимаем один месяц.
    const now = new Date();
    const start = new Date(
        now.getFullYear(),
        now.getMonth() - (period === 'previous' ? 1 : 0),
        1
    );

    // День 0 следующего месяца = последний день выбранного месяца.
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    return { from: formatDate(start), to: formatDate(end) };
}

// Получаем фильтр «Все / Расходы / Доходы» для списка операций.
export function getSelectedType() {
    return document.querySelector('input[name="filter-type"]:checked')?.value || 'all';
}

// Выбираем по дате. Сравнение строк работает, потому что
// backend возвращает даты в одинаковом формате YYYY-MM-DD.
export function filterByPeriod(transactions, from, to) {
    return transactions.filter((transaction) => {
        if (from && transaction.date < from) return false;
        if (to && transaction.date > to) return false;
        return true;
    });
}

// Включаем/выключаем два календаря и связываем события с render.
// onChange — функция, которую передаёт main.js; сама filters.js
// не знает, как именно рисуется список транзакций.
export function initFilters(onChange) {
    function updatePeriodInputs() {
        const period = document.querySelector(
            'input[name="filter-period"]:checked'
        )?.value;
        $('custom-date-range').hidden = period !== 'custom';
    }

    document.querySelectorAll('input[name="filter-period"]').forEach(input => {
        input.addEventListener('change', () => {
            updatePeriodInputs();
            onChange(); // Просим другую часть программы обновить экран.
        });
    });

    $('filter-date-from').addEventListener('change', onChange);
    $('filter-date-to').addEventListener('change', onChange);

    document.querySelectorAll('input[name="filter-type"]').forEach(input => {
        input.addEventListener('change', onChange);
    });

    updatePeriodInputs(); // Правильное состояние при первой загрузке.
}

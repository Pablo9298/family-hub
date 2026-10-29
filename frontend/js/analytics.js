
/* ==========================================================
   FAMILY HUB — analytics.js

   Аналитика расходов по категориям.

   Получаем операции за выбранный период,
   группируем расходы по категориям
   и рассчитываем сумму и процент каждой категории.

   Здесь пока нет HTML и диаграммы.
   Сначала создаём расчёты, потом визуализацию.
   ========================================================== */


/**
 * Группирует расходы по категориям.
 *
 * @param {Array} transactions - операции выбранного периода.
 * @returns {Object} - общая сумма и список категорий.
 */
export function calculateExpenseCategories(transactions) {

    // Map хранит пары: категория -> сумма расходов.
    const categories = new Map();

    let totalExpenses = 0;

    for (const transaction of transactions) {

        // Доходы в диаграмму расходов не включаем.
        if (transaction.type !== 'expense') continue;

        const amount = Number(transaction.amount);

        // Игнорируем некорректные суммы.
        if (!Number.isFinite(amount) || amount <= 0) continue;

        const category = String(transaction.category || '').trim() || 'Без категории';

        totalExpenses += amount;

        // Добавляем сумму к уже накопленной категории.
        categories.set(
            category,
            (categories.get(category) || 0) + amount
        );
    }

    // Преобразуем Map в массив объектов.
    const items = [...categories.entries()].map(([name, amount]) => ({
        name,
        amount,
        percentage: totalExpenses > 0
            ? (amount / totalExpenses) * 100
            : 0
    }));

    // Самая затратная категория идёт первой.
    items.sort((a, b) => b.amount - a.amount);

    return {
        totalExpenses,
        categories: items
    };
}


/*
 * =====================================================
 * ОТОБРАЖЕНИЕ ДИАГРАММЫ РАСХОДОВ
 * =====================================================
 *
 * Получаем уже рассчитанную аналитику.
 * Создаём кольцевую SVG-диаграмму и легенду.
 *
 * Важно:
 * - Новых запросов к backend здесь нет.
 * - Названия категорий выводим через textContent.
 * - Доходы сюда не попадают.
 */

export function renderExpenseChart(analytics) {

    const chartContainer = document.getElementById('expense-chart');
    const legendContainer = document.getElementById('expense-legend');

    if (!chartContainer || !legendContainer) return;

    // Очищаем прежнюю диаграмму.
    chartContainer.replaceChildren();
    legendContainer.replaceChildren();

    const { totalExpenses, categories } = analytics;

    // Нет расходов — показываем понятное сообщение.
    if (totalExpenses <= 0 || categories.length === 0) {
        const message = document.createElement('p');
        message.className = 'muted';
        message.textContent = 'Нет расходов за выбранный период.';

        chartContainer.appendChild(message);
        return;
    }

    // Цвета для категорий.
    const colors = [
        '#818cf8',
        '#34d399',
        '#fbbf24',
        '#fb7185',
        '#38bdf8',
        '#c084fc',
        '#fb923c',
        '#2dd4bf'
    ];

    const svgNS = 'http://www.w3.org/2000/svg';

    // SVG-кольцо диаметром 220.
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 220 220');
    svg.setAttribute('width', '220');
    svg.setAttribute('height', '220');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Распределение расходов по категориям');

    const radius = 78;
    const circumference = 2 * Math.PI * radius;

    let offset = 0;

    categories.forEach((category, index) => {

        const segment = document.createElementNS(svgNS, 'circle');

        const length = (category.percentage / 100) * circumference;

        segment.setAttribute('cx', '110');
        segment.setAttribute('cy', '110');
        segment.setAttribute('r', String(radius));
        segment.setAttribute('fill', 'none');
        segment.setAttribute('stroke', colors[index % colors.length]);
        segment.setAttribute('stroke-width', '27');

        segment.setAttribute(
            'stroke-dasharray',
            `${length} ${circumference}`
        );

        segment.setAttribute(
            'stroke-dashoffset',
            String(-offset)
        );

        // Начинаем рисовать кольцо сверху.
        segment.setAttribute(
            'transform',
            'rotate(-90 110 110)'
        );

        svg.appendChild(segment);

        offset += length;
    });

    // Общая сумма в центре диаграммы.
    const totalLabel = document.createElementNS(svgNS, 'text');
    totalLabel.setAttribute('x', '110');
    totalLabel.setAttribute('y', '105');
    totalLabel.setAttribute('text-anchor', 'middle');
    totalLabel.setAttribute('fill', 'currentColor');
    totalLabel.setAttribute('font-size', '20');
    totalLabel.setAttribute('font-weight', '700');
    totalLabel.textContent = `${totalExpenses.toFixed(2)} €`;

    const subtitle = document.createElementNS(svgNS, 'text');
    subtitle.setAttribute('x', '110');
    subtitle.setAttribute('y', '125');
    subtitle.setAttribute('text-anchor', 'middle');
    subtitle.setAttribute('fill', 'currentColor');
    subtitle.setAttribute('font-size', '11');
    subtitle.textContent = 'Всего расходов';

    svg.append(totalLabel, subtitle);
    chartContainer.appendChild(svg);

    // Создаём легенду с суммами и процентами.
    categories.forEach((category, index) => {

        const item = document.createElement('div');
        item.className = 'expense-legend-item';

        const colorDot = document.createElement('span');
        colorDot.className = 'expense-legend-color';
        colorDot.style.backgroundColor = colors[index % colors.length];

        const name = document.createElement('span');
        name.className = 'expense-legend-name';
        name.textContent = category.name;

        const amount = document.createElement('span');
        amount.className = 'expense-legend-amount';
        amount.textContent =
            `${category.amount.toFixed(2)} € (${category.percentage.toFixed(1)}%)`;

        item.append(colorDot, name, amount);
        legendContainer.appendChild(item);
    });
}


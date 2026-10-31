
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


/*
 * =====================================================
 * СРАВНЕНИЕ ДОХОДОВ И РАСХОДОВ ПО МЕСЯЦАМ
 * =====================================================
 *
 * Берём все загруженные транзакции выбранного
 * финансового пространства.
 *
 * Результат:
 * [
 *   { month: '2026-09', income: 1500, expenses: 800 },
 *   { month: '2026-10', income: 1700, expenses: 950 }
 * ]
 */

export function calculateMonthlyStatistics(transactions, monthCount = 6) {

    const now = new Date();

    // Храним результаты по ключу YYYY-MM.
    const months = new Map();

    // Создаём последние 6 месяцев, включая текущий.
    // Даже если операций не было, месяц останется в графике.
    for (let i = monthCount - 1; i >= 0; i--) {

        const date = new Date(
            now.getFullYear(),
            now.getMonth() - i,
            1
        );

        const month = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0')
        ].join('-');

        months.set(month, {
            month,
            income: 0,
            expenses: 0
        });
    }

    // Распределяем операции по месяцам.
    for (const transaction of transactions) {

        const month = String(transaction.date).slice(0, 7);

        // Старые и будущие месяцы за пределами графика пропускаем.
        if (!months.has(month)) continue;

        const amount = Number(transaction.amount);

        if (!Number.isFinite(amount) || amount <= 0) continue;

        const stats = months.get(month);

        if (transaction.type === 'income') {
            stats.income += amount;
        }

        if (transaction.type === 'expense') {
            stats.expenses += amount;
        }
    }

    // Возвращаем месяцы по порядку: от старого к новому.
    return [...months.values()];
}


/*
 * =====================================================
 * ГРАФИК ДОХОДОВ И РАСХОДОВ ПО МЕСЯЦАМ
 * =====================================================
 *
 * Используем уже рассчитанную статистику:
 * [
 *   { month: '2026-09', income: 1200, expenses: 800 },
 *   { month: '2026-10', income: 1500, expenses: 900 }
 * ]
 *
 * Строим столбчатый график без сторонних библиотек.
 * Высота столбцов зависит от максимальной суммы.
 */

export function renderMonthlyChart(statistics) {

    const container = document.getElementById('monthly-chart');
    if (!container) return;

    // Удаляем предыдущий график перед перерисовкой.
    container.replaceChildren();

    // Легенда графика.
    const legend = document.createElement('div');
    legend.className = 'monthly-chart-legend';

    for (const [type, label] of [
        ['income', 'Доходы'],
        ['expenses', 'Расходы']
    ]) {
        const item = document.createElement('span');
        item.className = `monthly-chart-legend-item ${type}`;
        item.textContent = label;
        legend.appendChild(item);
    }

    container.appendChild(legend);

    // Вычисляем максимум для общей шкалы.
    const maxAmount = Math.max(
        0,
        ...statistics.flatMap(month => [
            month.income,
            month.expenses
        ])
    );

    // Если операций нет, показываем пустое состояние.
    if (maxAmount === 0) {
        const message = document.createElement('p');
        message.className = 'muted';
        message.textContent = 'Нет доходов и расходов за последние 6 месяцев.';
        container.appendChild(message);
        return;
    }

    // Область с шестью группами столбцов.
    const chart = document.createElement('div');
    chart.className = 'monthly-chart-bars';

    const formatMoney = amount =>
        new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'EUR'
        }).format(amount);

    const formatMonth = monthKey => {
        const [year, month] = monthKey.split('-').map(Number);

        return new Intl.DateTimeFormat('ru-RU', {
            month: 'short'
        }).format(new Date(year, month - 1, 1));
    };

    for (const month of statistics) {

        const group = document.createElement('div');
        group.className = 'monthly-chart-group';

        const bars = document.createElement('div');
        bars.className = 'monthly-chart-pair';

        for (const type of ['income', 'expenses']) {

            const amount = month[type];

            const bar = document.createElement('div');
            bar.className = `monthly-chart-bar ${type}`;

            // Для маленьких положительных сумм оставляем
            // минимум 3% высоты, чтобы столбец был виден.
            // Точную сумму показываем в подсказке.
            const percent = amount > 0
                ? Math.max(3, (amount / maxAmount) * 100)
                : 0;

            bar.style.height = `${percent}%`;
            bar.style.setProperty('--bar-height', `${percent}%`);

            bar.title = `${type === 'income' ? 'Доходы' : 'Расходы'}: ${formatMoney(amount)}`;

            bar.setAttribute(
                'aria-label',
                bar.title
            );

            // Обёртка для столбца и подписи суммы.
            const barWrapper = document.createElement('div');
            barWrapper.className = 'monthly-chart-bar-wrapper';
            barWrapper.style.setProperty('--bar-height', `${percent}%`);

            // =====================================================
            // КОМПАКТНАЯ ПОДПИСЬ НАД СТОЛБЦОМ
            // =====================================================

            if (amount > 0) {

                const amountLabel = document.createElement('span');
                amountLabel.className = 'monthly-chart-value';

                // Компактная сумма без копеек.
                // Например: 2030 € вместо 2 030,00 €.
                const compactAmount = new Intl.NumberFormat('ru-RU', {
                    maximumFractionDigits: 0
                }).format(amount);

                amountLabel.textContent = `${compactAmount} €`;

                // Точная сумма остаётся доступна в подсказке.
                amountLabel.title = formatMoney(amount);

                barWrapper.appendChild(amountLabel);
            }

            barWrapper.appendChild(bar);
            bars.appendChild(barWrapper);
        }

        const monthLabel = document.createElement('span');
        monthLabel.className = 'monthly-chart-month';
        monthLabel.textContent = formatMonth(month.month);

        // Общая группа: два столбца + название месяца.
        group.append(bars, monthLabel);
        chart.appendChild(group);
    }

    container.appendChild(chart);
}
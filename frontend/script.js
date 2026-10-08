// Адрес нашего сервера (он работает на порту 3001)
const API_URL = 'http://localhost:3001/transactions';

// Функция для загрузки и отображения всех транзакций
async function loadTransactions() {
    try {
        const response = await fetch(API_URL);
        const transactions = await response.json();

        const list = document.getElementById('transaction-list');
        const totalElement = document.getElementById('total');

        if (transactions.length === 0) {
            list.innerHTML = '<p>Пока нет записей. Добавьте первую!</p>';
            totalElement.textContent = 'Итого: 0 €';
            return;
        }

        // 1. Группируем транзакции по месяцам
        const groups = {};
        transactions.forEach(t => {
            // Из даты (2026-09-08) получаем месяц (2026-09)
            const monthKey = t.date.substring(0, 7);
            if (!groups[monthKey]) {
                groups[monthKey] = [];
            }
            groups[monthKey].push(t);
        });

        // 2. Сортируем месяцы (от старых к новым)
        const sortedMonths = Object.keys(groups).sort();

        // 3. Строим HTML
        let totalOverall = 0;
        let html = '';

        sortedMonths.forEach(monthKey => {
            const monthTransactions = groups[monthKey];
            let monthTotal = 0;

            // Название месяца (Сентябрь 2026)
            const [year, month] = monthKey.split('-');
            const monthName = new Date(year, month - 1).toLocaleString('ru', { month: 'long' });
            const monthTitle = `${monthName} ${year}`;

            // Начинаем блок месяца
            html += `<div class="month-block"><h3>📅 ${monthTitle}</h3>`;

            // Сортируем транзакции внутри месяца по дате (от старых к новым)
            monthTransactions.sort((a, b) => a.date.localeCompare(b.date));

            monthTransactions.forEach(t => {
                monthTotal += t.amount;
                totalOverall += t.amount;

                // Форматируем дату для отображения (08.09.2026)
                const displayDate = t.date.split('-').reverse().join('.');

                html += `
                    <div class="transaction-item">
                        <span>
                            <span class="date">${displayDate}</span>
                            <strong>${t.desc}</strong> (${t.category})
                        </span>
                        <span>${t.amount} €</span>

                        <button onclick="deleteTransaction(${t.id})">
                            🗑️ Удалить
                        </button>
                    </div>
                `;
            });

            // Итог по месяцу
            html += `<div class="month-total">Итого за месяц: <strong>${monthTotal} €</strong></div>`;
            html += `</div>`; // Закрываем month-block
        });

        // Вставляем список
        list.innerHTML = html;

        // Общий итог
        totalElement.textContent = `💰 Общий итог за всё время: ${totalOverall} €`;
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        alert('Не удалось загрузить данные. Проверь, запущен ли сервер!');
    }
}

// Удаляем транзакцию по ID
async function deleteTransaction(id) {
    // Спрашиваем подтверждение
    const confirmed = confirm('Удалить эту транзакцию?')

    if(!confirmed) {
        return;
    }

    try {
        // Отправляем DELETE на сервер
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE'
        });
        // Проверяем ответ сервера
        if(!response.ok) {
            throw new Error('Ошибка удаления транзакции');
        }

        await loadTransactions();

    } catch(error) {
        console.error('Ошибка удаления:', error);
        alert('Не удалось удалить транзакцию');
    }
}

// Функция для добавления новой транзакции
async function addTransaction() {
    // Получаем значения из полей ввода
    const date = document.getElementById('date').value;
    const desc = document.getElementById('desc').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const category = document.getElementById('category').value;

    // Простейшая проверка: все поля должны быть заполнены
    if (!desc || isNaN(amount) || !category) {
        alert('Пожалуйста, заполни все поля!');
        return;
    }

    // Формируем объект с данными
    const transaction = {
        date: date,
        desc: desc,
        amount: amount,
        category: category
    };

    try {
        // Отправляем POST-запрос к серверу
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(transaction)
        });

        // Если сервер вернул ошибку
        if (!response.ok) {
            throw new Error('Ошибка при добавлении записи');
        }

        // Очищаем поля ввода
        document.getElementById('desc').value = '';
        document.getElementById('amount').value = '';
        document.getElementById('category').value = '';

        // Перезагружаем список транзакций
        await loadTransactions();
    } catch (error) {
        console.error('Ошибка добавления:', error);
        alert('Не удалось добавить запись. Проверь, запущен ли сервер!');
    }
}

// Загружаем транзакции при загрузке страницы
loadTransactions();

 // Адрес нашего сервера
const API_URL = 'http://localhost:3001/transactions';

// ID транзакции, которую сейчас редактируем
let editingTransactionId = null;

// =====================================================
// 1. УСТАНАВЛИВАЕМ СЕГОДНЯШНЮЮ ДАТУ
// =====================================================

const today = new Date();

const localDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
].join('-');

document.getElementById('date').value = localDate;


// =====================================================
// 2. ЗАГРУЖАЕМ И ОТОБРАЖАЕМ ТРАНЗАКЦИИ
// =====================================================

async function loadTransactions() {
    try {
        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error('Ошибка загрузки транзакций');
        }

        const transactions = await response.json();

        const list = document.getElementById('transaction-list');
        const totalElement = document.getElementById('total');

        if (transactions.length === 0) {
            list.innerHTML = '<p>Пока нет записей. Добавьте первую!</p>';
            totalElement.textContent = 'Итого: 0 €';
            return;
        }

        // Группируем транзакции по месяцам
        const groups = {};

        transactions.forEach(t => {
            const monthKey = t.date.substring(0, 7);

            if (!groups[monthKey]) {
                groups[monthKey] = [];
            }

            groups[monthKey].push(t);
        });

        // Сортируем месяцы от старых к новым
        const sortedMonths = Object.keys(groups).sort();

        let totalOverall = 0;
        let html = '';

        sortedMonths.forEach(monthKey => {
            const monthTransactions = groups[monthKey];
            let monthTotal = 0;

            // Формируем название месяца
            const [year, month] = monthKey.split('-');

            const monthName = new Date(
                Number(year),
                Number(month) - 1
            ).toLocaleString('ru', { month: 'long' });

            const monthTitle = `${monthName} ${year}`;

            html += `
                <div class="month-block">
                    <h3>📅 ${monthTitle}</h3>
            `;

            // Сортируем транзакции по дате
            monthTransactions.sort((a, b) =>
                a.date.localeCompare(b.date)
            );

            monthTransactions.forEach(t => {
                monthTotal += t.amount;
                totalOverall += t.amount;

                const displayDate = t.date
                    .split('-')
                    .reverse()
                    .join('.');

                html += `
                    <div class="transaction-item">
                        <span>
                            <span class="date">${displayDate}</span>
                            <strong>${t.desc}</strong> (${t.category})
                        </span>

                        <span>${t.amount} €</span>

                        <button onclick="openEditDialog(${t.id})">
                            ✏️ Редактировать
                        </button>

                        <button onclick="deleteTransaction(${t.id})">
                            🗑️ Удалить
                        </button>
                    </div>
                `;
            });

            html += `
                <div class="month-total">
                    Итого за месяц:
                    <strong>${monthTotal} €</strong>
                </div>
            `;

            html += '</div>';
        });

        list.innerHTML = html;

        totalElement.textContent =
            `💰 Общий итог за всё время: ${totalOverall} €`;

    } catch (error) {
        console.error('Ошибка загрузки:', error);
        alert('Не удалось загрузить транзакции');
    }
}


// =====================================================
// 3. ДОБАВЛЯЕМ НОВУЮ ТРАНЗАКЦИЮ (POST)
// =====================================================

async function addTransaction() {
    const date = document.getElementById('date').value;
    const desc = document.getElementById('desc').value.trim();
    const amountValue = document.getElementById('amount').value;
    const amount = Number(amountValue);
    const category = document.getElementById('category').value.trim();

    // Проверяем данные
    if (!date || !desc || amountValue === '' ||
        !Number.isFinite(amount) || !category) {
        alert('Пожалуйста, заполни все поля!');
        return;
    }

    const transaction = {
        date,
        desc,
        amount,
        category
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(transaction)
        });

        if (!response.ok) {
            throw new Error('Ошибка добавления транзакции');
        }

        // Очищаем поля после добавления
        document.getElementById('desc').value = '';
        document.getElementById('amount').value = '';
        document.getElementById('category').value = '';

        await loadTransactions();

    } catch (error) {
        console.error('Ошибка добавления:', error);
        alert('Не удалось добавить транзакцию');
    }
}


// =====================================================
// 4. УДАЛЯЕМ ТРАНЗАКЦИЮ (DELETE)
// =====================================================

async function deleteTransaction(id) {
    const confirmed = confirm('Удалить эту транзакцию?');

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Ошибка удаления транзакции');
        }

        await loadTransactions();

    } catch (error) {
        console.error('Ошибка удаления:', error);
        alert('Не удалось удалить транзакцию');
    }
}


// =====================================================
// 5. ОТКРЫВАЕМ ОКНО РЕДАКТИРОВАНИЯ
// =====================================================

async function openEditDialog(id) {
    try {
        // Получаем актуальные транзакции
        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error('Ошибка загрузки транзакций');
        }

        const transactions = await response.json();

        // Находим выбранную транзакцию
        const transaction = transactions.find(t => t.id === id);

        if (!transaction) {
            alert('Транзакция не найдена');
            return;
        }

        // Запоминаем ID редактируемой транзакции
        editingTransactionId = id;

        // Заполняем форму текущими данными
        document.getElementById('edit-date').value =
            transaction.date;

        document.getElementById('edit-desc').value =
            transaction.desc;

        document.getElementById('edit-amount').value =
            transaction.amount;

        document.getElementById('edit-category').value =
            transaction.category;

        // Открываем модальное окно
        document.getElementById('edit-dialog').showModal();

    } catch (error) {
        console.error('Ошибка открытия редактирования:', error);
        alert('Не удалось открыть редактирование');
    }
}


// =====================================================
// 6. СОХРАНЯЕМ ИЗМЕНЕНИЯ (PUT)
// =====================================================

document.getElementById('edit-form').addEventListener(
    'submit',
    async (event) => {

        // Запрещаем стандартную отправку формы
        event.preventDefault();

        if (editingTransactionId === null) {
            alert('Не выбрана транзакция для редактирования');
            return;
        }

        // Получаем изменённые значения
        const date = document.getElementById('edit-date').value;

        const desc = document.getElementById('edit-desc')
            .value.trim();

        const amountValue = document.getElementById('edit-amount')
            .value;

        const amount = Number(amountValue);

        const category = document.getElementById('edit-category')
            .value.trim();

        // Проверяем данные
        if (!date || !desc || amountValue === '' ||
            !Number.isFinite(amount) || !category) {
            alert('Пожалуйста, заполни все поля!');
            return;
        }

        // Формируем обновлённую транзакцию
        const updatedTransaction = {
            date,
            desc,
            amount,
            category
        };

        try {
            // Отправляем изменения на сервер
            const response = await fetch(
                `${API_URL}/${editingTransactionId}`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updatedTransaction)
                }
            );

            if (!response.ok) {
                throw new Error('Ошибка обновления транзакции');
            }

            // Закрываем модальное окно
            document.getElementById('edit-dialog').close();

            // Сбрасываем ID
            editingTransactionId = null;

            // Загружаем обновлённый список
            await loadTransactions();

            // Временное уведомление
            alert('Транзакция успешно изменена!');

        } catch (error) {
            console.error('Ошибка сохранения:', error);
            alert('Не удалось сохранить изменения');
        }
    }
);


// =====================================================
// 7. КНОПКА «ОТМЕНА»
// =====================================================

document.getElementById('cancel-edit').addEventListener(
    'click',
    () => {
        document.getElementById('edit-dialog').close();
        editingTransactionId = null;
    }
);


// =====================================================
// 8. ЗАГРУЖАЕМ ДАННЫЕ ПРИ ОТКРЫТИИ СТРАНИЦЫ
// =====================================================

loadTransactions();

// 1. Подключаем библиотеки
const express = require('express');
const cors = require('cors');
const fs = require('fs'); // fs - это встроенный модуль для работы с файлами

// 2. Создаем приложение
const app = express();

// 3. Включаем "парсер" JSON, чтобы сервер понимал данные, которые мы ему отправляем
app.use(express.json());

// 4. Включаем CORS, чтобы фронтенд мог общаться с сервером
app.use(cors());

// 5. Указываем порт, на котором будет работать сервер
const PORT = 3001;

// 6. Пишем две вспомогательные функции для работы с файлом data.json

// Читаем данные из файла
function readData() {
    try {
        const data = fs.readFileSync('./data.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Если файла нет, создаем пустой массив
        return [];
    }
}

// Записываем данные в файл
function writeData(data) {
    fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));
}

// 7. Создаем первый "эндпоинт" (ручку) GET /transactions
// Это значит: когда пользователь зайдет на http://localhost:3001/transactions,
// сервер вернет ему все записи из нашего файла
app.get('/transactions', (req, res) => {
    const transactions = readData();
    res.json(transactions); // отправляем данные в формате JSON
});

// 8. Создаем второй "эндпоинт" POST /transactions
// Сюда пользователь будет отправлять новые данные (расходы, доходы)
app.post('/transactions', (req, res) => {
    const transactions = readData();
    const newTransaction = {
        id: Date.now(), // генерируем уникальный ID на основе времени
        date: req.body.date || new Date().toISOString().split('T')[0], // если дата не передана, ставим сегодня
        ...req.body     // берем все поля, которые прислал пользователь
    };
    transactions.push(newTransaction); // добавляем в массив
    writeData(transactions); // сохраняем в файл
    res.json(newTransaction); // отправляем обратно созданную запись
});

// DELETE /transactions/:id
app.delete('/transactions/:id', (req, res) => {
    const transactions = readData();

    // Получаем ID из адреса запроса
    const id = Number(req.params.id);

    // Проверяем существует ли транзакция
    const transaction = transactions.find(t => t.id === id);

    if(!transaction) {
        return res.status(404).json({
            message: 'Transaction not found'
        })
    }

    // Удаляем транзакцию из массива
    const updateTransactions = transactions.filter(t => t.id !== id);

    // Сохраняем изменения
    writeData(updateTransactions);

    res.json({
        message: 'Transaction deleted successfully'
    })

});

// 9. Запускаем сервер и говорим об этом в консоли
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
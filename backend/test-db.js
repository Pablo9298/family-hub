const pool = require('./db');

async function testConnection() {
    try {
        const result = await pool.query('SELECT current_database()');

        console.log('Подключение успешно!');
        console.log('База данных:', result.rows[0].current_database);
    } catch (error) {
        console.error('Ошибка подключения:', error.message);
    } finally {
        await pool.end();
    }
}

testConnection();
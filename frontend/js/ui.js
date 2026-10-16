/* ==========================================================
   FAMILY HUB — ui.js
   Общие инструменты интерфейса: поиск элементов, деньги,
   безопасный текст, уведомления и переключение светлой/тёмной темы.
   ========================================================== */

// Короткая запись document.getElementById('date') -> $('date').
// $ не является специальным оператором: это имя нашей функции.
export const $ = (id) => document.getElementById(id);

// Превращаем число в строку вроде «1 850,00 €» по русским правилам.
// Intl.NumberFormat предоставляет сам браузер, библиотек не требуется.
export const money = (value) => new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'EUR'
}).format(value);

// Защищаем HTML, в который вставляем пользовательский текст.
// Например, символ < заменится на &lt; и не станет HTML-тегом.
// Важно использовать это при построении строк с innerHTML.
export function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

// Небольшое сообщение в углу экрана вместо блокирующего alert().
// type по умолчанию = success; при 'error' меняем цвет через CSS.
export function showToast(message, type = 'success') {
    const toast = document.createElement('div'); // Создаём новый DOM-элемент.
    toast.className = `toast ${type === 'error' ? 'error' : ''}`;
    toast.setAttribute('role', 'status'); // Подсказка для экранных дикторов.
    toast.textContent = `${type === 'error' ? '⚠' : '✓'} ${message}`;
    $('toast-container').appendChild(toast); // Добавляем в интерфейс.
    setTimeout(() => toast.remove(), 3500); // Убираем через 3,5 секунды.
}

// Обновляем иконку и доступное описание кнопки смены темы.
function updateThemeButton() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('theme-toggle').textContent = dark ? '☀' : '☾';
    $('theme-toggle').setAttribute(
        'aria-label',
        dark ? 'Включить светлую тему' : 'Включить тёмную тему'
    );
}

// Вызываем один раз после загрузки HTML — в main.js.
export function initTheme() {
    // index.html уже применяет сохранённую тему до отрисовки страницы.
    updateThemeButton();

    $('theme-toggle').addEventListener('click', () => {
        const currentTheme = document.documentElement.dataset.theme;
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';

        // data-theme используется CSS-селекторами и переменными темы.
        document.documentElement.dataset.theme = nextTheme;
        // localStorage сохраняет выбор в браузере между посещениями.
        localStorage.setItem('familyhub-theme', nextTheme);
        updateThemeButton();
    });
}

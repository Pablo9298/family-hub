/* ==========================================================
   FAMILY HUB — categories.js

   ЗАДАЧА: подсказки категорий в формах добавления и редактирования.

   Данные движутся по цепочке:
   GET /categories -> api.js -> массив categories -> <datalist>.

   ПОЧЕМУ <datalist>?
   Это встроенная функция HTML для подсказок текстовому полю.
   При этом вводить новую категорию по-прежнему разрешено.
   Никаких библиотек или отдельного CSS не требуется.

   Важно: настоящий источник истины — PostgreSQL.
   Фронтенд лишь подсказывает названия. Создание категории,
   нормализация регистра и проверка дубликатов выполняются backend.
   ========================================================== */

import { getCategories } from './api.js';
import { $ } from './ui.js';

// Список в памяти браузера. Не заменяет базу данных.
let allCategories = [];

// Смотрим, какой тип операции выбран в конкретной форме.
// prefix === '' — форма добавления (name="type").
// prefix === 'edit-' — форма редактирования (name="edit-type").
function getFormType(prefix = '') {
    const radioName = prefix ? 'edit-type' : 'type';
    return document.querySelector(`input[name="${radioName}"]:checked`)?.value;
}

// Заполняем <datalist> подходящими категориями.
export function renderCategorySuggestions(prefix = '') {
    // У форм разные ID: category-suggestions и edit-category-suggestions.
    const datalistId = prefix ? 'edit-category-suggestions' : 'category-suggestions';
    const datalist = $(datalistId);
    const selectedType = getFormType(prefix);

    // Убираем предложения предыдущего типа операции.
    // replaceChildren() очищает DOM-узел безопасно, без innerHTML.
    datalist.replaceChildren();

    // Для расхода показываем только expense; для дохода — income.
    for (const category of allCategories) {
        if (category.type !== selectedType) continue;

        // <option value="продукты"> станет нативной подсказкой.
        const option = document.createElement('option');
        option.value = category.name;
        datalist.appendChild(option);
    }
}

// После GET обновляем общий список и ОБЕ формы.
// Если новая категория появилась после POST/PUT, она будет в подсказках.
export async function refreshCategories() {
    allCategories = await getCategories();
    renderCategorySuggestions();
    renderCategorySuggestions('edit-');
}

// При смене типа операции пересчитываем подсказки.
// Например, 'зарплата' не предлагается для expense.
export function initCategorySuggestions() {
    for (const prefix of ['', 'edit-']) {
        const radioName = prefix ? 'edit-type' : 'type';

        document.querySelectorAll(`input[name="${radioName}"]`).forEach(radio => {
            radio.addEventListener('change', () => {
                renderCategorySuggestions(prefix);
            });
        });
    }
}

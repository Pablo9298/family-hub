/* ==========================================================
   FAMILY HUB — main.js
   Точка входа в frontend: связывает HTML, события и модули.

   Важная идея модулей:
   import { имя } from './файл.js' берёт экспортированную функцию.
   Мы НЕ подключаем каждый JS-файл через отдельный <script>.
   В index.html подключаем только main.js с type="module";
   браузер сам загрузит нужные импортируемые файлы.

   Пользователь -> событие HTML -> main.js -> api.js -> Express.
   После успеха: loadTransactions() -> renderTransactions() -> DOM.
   ========================================================== */

import {
    createTransaction,
    updateTransaction,
    deleteTransaction,
    getWorkspaces,
    createWorkspace,
    setCurrentWorkspace,
    getCurrentUser,
    logout
} from './api.js';
import { $, money, showToast, initTheme } from './ui.js';
import { formatDate, initFilters } from './filters.js';
import {
    loadTransactions,
    renderTransactions,
    findTransaction,
    clearTransactions
} from './transactions.js';

import {
    initCategorySuggestions,
    renderCategorySuggestions,
    refreshCategories,
    clearCategories
} from './categories.js';

// Меню аккаунта, колокольчик и приглашения.
import { initInvitations } from './invitations.js';

// Управление участниками и отправка приглашений через UI.
import { initWorkspaceMembers } from './workspaceMembers.js';

// ID транзакций, над которыми сейчас открыто модальное окно.
// null = редактирование/удаление сейчас не выбрано.
let editingTransactionId = null;
let deletingTransactionId = null;

// Проверяем значения обеих форм одинаковым способом.
// Эти проверки помогают UX, но backend обязан валидировать всё повторно.
function isValidTransaction(data) {
    return Boolean(
        data.date &&
        data.desc &&
        data.category &&
        Number.isFinite(data.amount) &&
        data.amount > 0 &&
        ['income', 'expense'].includes(data.type)
    );
}

// Получаем значения полей из конкретной формы.
// Для редактирования prefix = 'edit-', для добавления = ''.
function readForm(prefix = '') {
    const amountValue = $(`${prefix}amount`).value;
    const typeName = prefix ? 'edit-type' : 'type';

    return {
        date: $(`${prefix}date`).value, // HTML <input type="date"> -> YYYY-MM-DD.
        desc: $(`${prefix}desc`).value.trim(), // Убираем пробелы по краям.
        amount: amountValue.trim() === '' ? NaN : Number(amountValue),
        category: $(`${prefix}category`).value.trim(),
        type: document.querySelector(`input[name="${typeName}"]:checked`)?.value
    };
}

// ========= 1. ДОБАВЛЕНИЕ: POST /transactions =========
async function addTransaction() {
    const data = readForm();
    if (!isValidTransaction(data)) {
        showToast('Заполни все поля корректно', 'error');
        return;
    }

    try {
        await createTransaction(data); // api.js отправит POST и дождётся ответа.
        $('desc').value = '';
        $('amount').value = '';
        $('category').value = '';
        await loadTransactions(); // Получаем свежие записи из PostgreSQL.
        showToast('Операция добавлена');
        // Обновим подсказки, если backend только что создал категорию.
        // Ошибка загрузки подсказок не отменяет уже сохранённую операцию.
        refreshCategories().catch(error => console.error('GET categories:', error));
    } catch (error) {
        console.error('POST:', error);
        showToast('Не удалось добавить или обновить список операций', 'error');
    }
}

// ========= 2. УДАЛЕНИЕ: диалог + DELETE /transactions/:id =========
function openDeleteDialog(id) {
    // Не делаем лишний GET: запись уже находится в transactions.js.
    const transaction = findTransaction(id);
    if (!transaction) {
        showToast('Запись не найдена', 'error');
        return;
    }

    deletingTransactionId = id;
    $('delete-description').textContent =
        `Удалить «${transaction.desc}» (${money(Number(transaction.amount))})? ` +
        'Это действие нельзя отменить.';
    $('delete-dialog').showModal(); // Нативное модальное окно браузера.
}

async function confirmDelete() {
    if (deletingTransactionId === null) return;
    const id = deletingTransactionId; // Запоминаем ID до закрытия окна.

    try {
        await deleteTransaction(id);
        $('delete-dialog').close();
        await loadTransactions();
        showToast('Операция удалена');
    } catch (error) {
        console.error('DELETE:', error);
        showToast('Не удалось удалить или обновить список операций', 'error');
    }
}

// ========= 3. РЕДАКТИРОВАНИЕ: диалог + PUT /transactions/:id =========
function openEditDialog(id) {
    const transaction = findTransaction(id);
    if (!transaction) {
        showToast('Транзакция не найдена', 'error');
        return;
    }

    editingTransactionId = id;
    // Заполняем форму значениями уже существующей записи.
    $('edit-date').value = transaction.date;
    $('edit-desc').value = transaction.desc;
    $('edit-amount').value = transaction.amount;
    $('edit-category').value = transaction.category;

    // Выбираем соответствующую радиокнопку — Расход либо Доход.
    const editTypeInput = document.querySelector(
        `input[name="edit-type"][value="${transaction.type}"]`
    );
    if (editTypeInput) editTypeInput.checked = true;

    // Программное .checked = true НЕ вызывает событие change.
    // Поэтому вручную обновляем подсказки для типа этой транзакции.
    renderCategorySuggestions('edit-');

    $('edit-dialog').showModal();
}

async function saveEdit() {
    if (editingTransactionId === null) return;
    const data = readForm('edit-');

    if (!isValidTransaction(data)) {
        showToast('Заполни все поля корректно', 'error');
        return;
    }

    try {
        await updateTransaction(editingTransactionId, data);
        $('edit-dialog').close();
        await loadTransactions();
        showToast('Изменения сохранены');
        refreshCategories().catch(error => console.error('GET categories:', error));
    } catch (error) {
        console.error('PUT:', error);
        showToast('Не удалось сохранить или обновить изменения', 'error');
    }
}

// ========= 4. НАСТРАИВАЕМ ОБРАБОТЧИКИ СОБЫТИЙ =========
function initTransactionEvents() {
    // submit — отправка формы по кнопке или Enter.
    // preventDefault() отменяет стандартную перезагрузку страницы.
    $('add-form').addEventListener('submit', (event) => {
        event.preventDefault();
        addTransaction();
    });

    $('edit-form').addEventListener('submit', (event) => {
        event.preventDefault();
        saveEdit();
    });

    // Делегирование: элементы списка создаются заново через innerHTML.
    // Слушаем общий родитель #transaction-list, а не каждую кнопку.
    $('transaction-list').addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button || !$('transaction-list').contains(button)) return;

        const id = Number(button.dataset.id); // data-id из HTML -> число.
        if (!Number.isSafeInteger(id) || id <= 0) return;

        if (button.dataset.action === 'edit') openEditDialog(id);
        if (button.dataset.action === 'delete') openDeleteDialog(id);
    });

    $('cancel-delete').addEventListener('click', () => $('delete-dialog').close());
    $('confirm-delete').addEventListener('click', confirmDelete);
    $('delete-dialog').addEventListener('close', () => {
        deletingTransactionId = null;
    });

    $('cancel-edit').addEventListener('click', () => $('edit-dialog').close());
    $('close-edit').addEventListener('click', () => $('edit-dialog').close());
    $('edit-dialog').addEventListener('close', () => {
        editingTransactionId = null;
    });
}


/*
 * =====================================================
 * ОКНО СОЗДАНИЯ ФИНАНСОВОГО ПРОСТРАНСТВА
 * =====================================================
 *
 * Пока реализуем только:
 *
 * 1. Открытие модального окна.
 * 2. Закрытие по крестику.
 * 3. Закрытие по кнопке "Отмена".
 *
 * Отправку POST /workspaces подключим следующим шагом.
 */

function initCreateWorkspaceDialog() {

    // Находим кнопку "+ Создать".
    const createButton = $('create-workspace-button');

    // Находим модальное окно.
    const dialog = $('create-workspace-dialog');

    // Находим поле для названия пространства.
    const nameInput = $('workspace-name');

    // =================================================
    // 1. ОТКРЫТИЕ ОКНА
    // =================================================

    createButton.addEventListener('click', () => {

        // Очищаем название от предыдущего ввода.
        nameInput.value = '';

        // Открываем нативное модальное окно браузера.
        dialog.showModal();

        // Сразу устанавливаем курсор в поле названия.
        nameInput.focus();
    });


    // =================================================
    // 2. ЗАКРЫТИЕ ПО КРЕСТИКУ
    // =================================================

    $('close-create-workspace').addEventListener('click', () => {

        dialog.close();
    });


    // =================================================
    // 3. ЗАКРЫТИЕ ПО КНОПКЕ "ОТМЕНА"
    // =================================================

    $('cancel-create-workspace').addEventListener('click', () => {

        dialog.close();
    });


    /*
     * =====================================================
     * СОЗДАНИЕ ПРОСТРАНСТВА ПО НАЖАТИЮ "СОЗДАТЬ"
     * =====================================================
     */

    $('create-workspace-form').addEventListener('submit', async (event) => {

        // Отключаем стандартную отправку HTML-формы.
        event.preventDefault();

        // Получаем название, введённое пользователем.
        const name = nameInput.value.trim();

        // Проверяем название до отправки на сервер.
        // Backend тоже выполнит свою проверку.
        if (name.length === 0 || name.length > 100) {
            showToast(
                'Название должно содержать от 1 до 100 символов',
                'error'
            );
            return;
        }

        // Находим кнопку отправки формы.
        const submitButton =
            $('create-workspace-form').querySelector('button[type="submit"]');

        // Не разрешаем отправить форму дважды.
        submitButton.disabled = true;
        createButton.disabled = true;

        try {

            // 1. Создаём пространство в PostgreSQL.
            const newWorkspace = await createWorkspace(name);

            console.log('Создано пространство:', newWorkspace);

            // 2. Добавляем новое пространство в select.
            const workspaceSelect = $('workspace-select');

            const option = document.createElement('option');

            option.value = String(newWorkspace.id);
            option.textContent = newWorkspace.name;

            workspaceSelect.appendChild(option);

            // 3. Закрываем модальное окно.
            dialog.close();

            // 4. Переключаемся на созданное пространство.
            //
            // Используем уже написанную функцию:
            // она очистит данные старого бюджета и загрузит новые.
            workspaceSelect.value = String(newWorkspace.id);

            await switchWorkspace(newWorkspace.id);

            // 5. Показываем сообщение об успехе.
            showToast('Финансовое пространство создано');

        } catch (error) {

            console.error('Create workspace error:', error);

            showToast(
                error.message || 'Не удалось создать пространство',
                'error'
            );

        } finally {

            // Снова разрешаем создавать пространства.
            submitButton.disabled = false;
            createButton.disabled = false;
        }
    });

}



/*
 * =====================================================
 * ПЕРЕКЛЮЧЕНИЕ ФИНАНСОВОГО ПРОСТРАНСТВА
 * =====================================================
 *
 * При смене workspace:
 *
 * 1. Блокируем финансовые формы.
 * 2. Закрываем открытые окна.
 * 3. Очищаем старые операции и категории.
 * 4. Выбираем новое пространство.
 * 5. Загружаем его финансовые данные.
 *
 * Так данные разных пространств не смешиваются.
 */

// true означает, что переключение выполняется.
let workspaceSwitching = false;

// Список элементов, которые нельзя использовать
// во время переключения пространства.
function setFinanceControlsDisabled(disabled) {

    // Блокируем поля и кнопки формы добавления.
    for (const element of $('add-form').elements) {
        element.disabled = disabled;
    }

    // Блокируем действия в истории транзакций.
    for (const button of
        $('transaction-list').querySelectorAll('button[data-action]')) {
        button.disabled = disabled;
    }
}

async function switchWorkspace(workspaceId) {

    // Предотвращаем одновременные переключения.
    if (workspaceSwitching) return;

    workspaceSwitching = true;

    const workspaceSelect = $('workspace-select');

    workspaceSelect.disabled = true;
    setFinanceControlsDisabled(true);

    try {

        // Закрываем окна редактирования и удаления,
        // чтобы случайно не применить изменения
        // к транзакции другого пространства.
        if ($('edit-dialog').open) {
            $('edit-dialog').close();
        }

        if ($('delete-dialog').open) {
            $('delete-dialog').close();
        }

        editingTransactionId = null;
        deletingTransactionId = null;

        // Устанавливаем новое пространство в api.js.
        setCurrentWorkspace(workspaceId);

        // Очищаем данные предыдущего пространства.
        clearTransactions();
        clearCategories();

        // Загружаем его категории.
        // Если категории недоступны, история всё равно
        // может продолжить загрузку.
        await refreshCategories().catch(error => {
            console.error('Workspace categories:', error);
            showToast('Не удалось загрузить категории', 'error');
        });

        // Загружаем историю и пересчитываем баланс.
        await loadTransactions();

        console.log('Workspace switched:', workspaceId);

    } catch (error) {

        console.error('Workspace switch error:', error);
        showToast('Не удалось загрузить пространство', 'error');

    } finally {

        workspaceSwitching = false;

        // Разрешаем переключаться снова.
        workspaceSelect.disabled = false;

        // Возвращаем доступ к финансовой форме.
        setFinanceControlsDisabled(false);
    }
}



/*
 * =====================================================
 * 5. ЗАПУСК ПРИЛОЖЕНИЯ
 * =====================================================
 *
 * Теперь порядок запуска следующий:
 *
 * 1. Настраиваем интерфейс и обработчики событий.
 * 2. Получаем пространства текущего пользователя.
 * 3. Выбираем доступное пространство.
 * 4. Загружаем категории и транзакции.
 *
 * Это важно: без выбранного workspace наши
 * getTransactions() и getCategories() не работают.
 */

async function initApp() {

    // =================================================
    // 1. НАСТРАИВАЕМ ИНТЕРФЕЙС
    // =================================================

    initTheme();


    // =====================================================
    // ПРОВЕРКА АВТОРИЗАЦИИ И ОТОБРАЖЕНИЕ АККАУНТА
    // =====================================================

    try {

        // Запрашиваем текущего пользователя через GET /auth/me.
        // Backend определяет его по серверной сессии.
        const user = await getCurrentUser();

        // Если пользователь не авторизован,
        // возвращаем его на главную страницу.
        if (!user) {
            window.location.replace('./index.html');
            return;
        }

        // Показываем имя Google-аккаунта.
        // Если имя отсутствует, используем email.
        $('account-name').textContent =
            user.display_name || user.email;

        // Показываем email текущего аккаунта.
        $('account-email').textContent = user.email;

        // Показываем первую букву имени в аватаре.
        const avatar = document.querySelector('.account-avatar');

        if (avatar) {
            const displayName = user.display_name || user.email || '?';

            avatar.textContent = displayName.trim().charAt(0).toUpperCase();
        }

        console.log('Пользователь авторизован:', user.display_name);

    } catch (error) {

        // Если backend недоступен, не загружаем
        // финансовые данные и показываем ошибку.
        console.error('Ошибка проверки авторизации:', error);

        showToast(
            'Не удалось проверить авторизацию. Проверь сервер.',
            'error'
        );

        return;
    }

    // =====================================================
    // МЕНЮ АККАУНТА И ПРИГЛАШЕНИЯ
    // =====================================================

    // Запускаем модуль только после успешной
    // проверки Google-сессии.
    //
    // Модуль:
    // - подключит обработчик нажатия на аватар;
    // - загрузит ожидающие приглашения;
    // - покажет колокольчик, если приглашения есть;
    // - настроит меню аккаунта.
    initInvitations();

    // Подключаем окно участников.
    // При открытии модуль сам определит выбранное пространство.
    initWorkspaceMembers();


    // =====================================================
    // ВЫХОД ИЗ FAMILY HUB
    // =====================================================

    $('logout-button').addEventListener('click', async () => {

        const button = $('logout-button');

        // Не допускаем повторного нажатия во время запроса.
        button.disabled = true;

        try {

            // Уничтожаем сессию на backend.
            await logout();

            // После успешного выхода открываем главную страницу.
            window.location.replace('./index.html');

        } catch (error) {

            console.error('Logout error:', error);

            showToast('Не удалось выйти из аккаунта', 'error');

            button.disabled = false;
        }
    });


    // Ставим сегодняшнюю локальную дату.
    $('date').value = formatDate(new Date());

    // Настраиваем фильтры и обработчики форм.
    initFilters(renderTransactions);
    initTransactionEvents();
    initCategorySuggestions();
    // Подключаем обработчики окна создания пространства.
    initCreateWorkspaceDialog();


    // =================================================
    // 2. ЗАГРУЖАЕМ ПРОСТРАНСТВА ПОЛЬЗОВАТЕЛЯ
    // =================================================

    try {

        // Backend определит пользователя по сессии
        // и вернёт только доступные ему пространства.
        const workspaces = await getWorkspaces();

        console.log('Мои пространства:', workspaces);

        // Если пользователь ещё не создал пространство,
        // пока показываем сообщение.
        //
        // Позже сделаем экран создания workspace.
        if (workspaces.length === 0) {

            showToast(
                'У тебя пока нет финансовых пространств',
                'error'
            );

            return;
        }

        // =================================================
        // 3. ВЫБИРАЕМ ПРОСТРАНСТВО
        // =================================================

        // Пока выбираем первое доступное пространство.
        //
        // ВАЖНО:
        // Это больше НЕ фиксированный ID = 1.
        //
        // Для разных пользователей первый workspace
        // может иметь разные ID.
        //
        // Позже добавим переключатель пространств.
        const workspace = workspaces[0];

        // Передаём выбранный ID в api.js.
        setCurrentWorkspace(workspace.id);
        // =================================================
        // ЗАПОЛНЯЕМ ПЕРЕКЛЮЧАТЕЛЬ ПРОСТРАНСТВ
        // =================================================

        // Находим наш HTML <select id="workspace-select">.
        const workspaceSelect = $('workspace-select');

        // Удаляем временную надпись "Загрузка пространств...".
        workspaceSelect.replaceChildren();

        // Проходим по всем пространствам пользователя.
        for (const item of workspaces) {

            // Создаём HTML-элемент <option>.
            const option = document.createElement('option');

            // ID пространства будет значением option.
            option.value = String(item.id);

            // Название пространства будет видно пользователю.
            option.textContent = item.name;

            // Добавляем вариант в выпадающий список.
            workspaceSelect.appendChild(option);
        }

        // Показываем выбранное пространство.
        workspaceSelect.value = String(workspace.id);


        // =================================================
        // ОБРАБОТЧИК ПЕРЕКЛЮЧЕНИЯ WORKSPACE
        // =================================================

        // change срабатывает, когда пользователь выбирает
        // другое пространство в выпадающем списке.
        workspaceSelect.addEventListener('change', async () => {

            const selectedId = workspaceSelect.value;

            // Вызываем функцию, которая очистит старые
            // данные и загрузит новое пространство.
            await switchWorkspace(selectedId);
        });

        // Разрешаем пользователю открывать список.
        // Если пространство пока только одно,
        // других вариантов просто не будет.
        workspaceSelect.disabled = false;


        console.log(
            'Выбрано пространство:',
            workspace.name,
            'ID:',
            workspace.id
        );

        // =================================================
        // 4. ЗАГРУЖАЕМ ФИНАНСОВЫЕ ДАННЫЕ
        // =================================================

        // Категории загружаем после выбора workspace.
        // Ошибка загрузки категорий не должна мешать
        // получению транзакций.
        refreshCategories().catch(error => {

            console.error(
                'Первоначальная загрузка категорий:',
                error
            );

            showToast(
                'Категории не загрузились; можно вводить их вручную',
                'error'
            );

        });

        // Загружаем операции выбранного пространства.
        await loadTransactions();

    } catch (error) {

        console.error('Ошибка запуска Family Hub:', error);

        // Это может быть отсутствие авторизации,
        // недоступный backend или ошибка загрузки.
        showToast(
            'Не удалось загрузить Family Hub. Проверь вход и сервер.',
            'error'
        );
    }
}


// Запускаем приложение после загрузки HTML.
initApp();
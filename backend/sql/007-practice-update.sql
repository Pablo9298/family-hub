UPDATE transactions
SET amount = 55.90,
    description = 'Продукты и напитки'
WHERE id = 1;

UPDATE transactions
SET category = 'Питание'
WHERE category = 'Еда';

UPDATE transactions
SET amount = 2000.00,
    category = 'Зарплата'
WHERE id = 2;

UPDATE transactions
SET description = 'Покупки в магазине',
    amount = 75.50,
    type = 'expense'
WHERE id = 1;

UPDATE transactions
SET description = 'Зарплата за октябрь',
    amount = 2200.00,
    type = 'income',
    category = 'Работа'
WHERE id = 2;
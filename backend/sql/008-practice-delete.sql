INSERT INTO transactions (
    date,
    description,
    amount,
    category,
    type
)
VALUES (
    '2026-10-14',
    'Тестовая покупка',
    10.00,
    'Тест',
    'expense'
)
RETURNING id, description, amount;


DELETE FROM transactions
WHERE id = 3
RETURNING id, description;
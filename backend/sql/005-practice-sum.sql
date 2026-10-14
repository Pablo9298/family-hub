SELECT SUM(amount)
FROM transactions
WHERE type = 'income';

SELECT SUM(amount)
FROM transactions
WHERE type = 'expense';
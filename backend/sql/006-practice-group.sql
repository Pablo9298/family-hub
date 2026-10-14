SELECT type, SUM(amount)
FROM transactions
GROUP BY type;

SELECT category, SUM(amount)
FROM transactions
GROUP BY category;

SELECT category, SUM(amount) AS total
FROM transactions
WHERE type = 'expense'
GROUP BY category
ORDER BY total DESC;
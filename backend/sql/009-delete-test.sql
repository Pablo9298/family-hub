DELETE FROM transactions
WHERE id = 3
RETURNING id, description;
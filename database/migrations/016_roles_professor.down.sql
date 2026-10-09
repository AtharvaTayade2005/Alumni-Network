-- 016_roles_professor.down.sql
DELETE FROM roles WHERE LOWER(name) IN ('professor', 'faculty');

-- 016_roles_professor.sql
-- Adds PROFESSOR and FACULTY roles to support academic advisors and departmental liaisons.

INSERT INTO roles (name, description) VALUES
    ('PROFESSOR', 'University faculty member, researcher and academic advisor'),
    ('FACULTY', 'University department faculty liaison')
ON CONFLICT (LOWER(name)) DO NOTHING;

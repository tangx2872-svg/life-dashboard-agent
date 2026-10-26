-- Option B: run with a MySQL administrator when using an EXISTING MySQL instance.
-- Replace the example password before executing. Do not put actual passwords in Git.
CREATE DATABASE IF NOT EXISTS life_dashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'life_dashboard'@'127.0.0.1' IDENTIFIED BY 'REPLACE_WITH_A_STRONG_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE ON life_dashboard.* TO 'life_dashboard'@'127.0.0.1';
-- Tables are created by the Node.js service on first start.

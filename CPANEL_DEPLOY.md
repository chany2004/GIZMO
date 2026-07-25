# Deploy GIZMO on cPanel

1. In cPanel, create a MySQL database and database user. Assign the user **ALL PRIVILEGES** for that database.
2. Open phpMyAdmin, select the new database, then import `database/gizmo.sql`.
3. Upload this project into `public_html` (or a subfolder such as `public_html/gizmo`).
4. Copy `.env.example` to `.env` in the project root and enter the database credentials from step 1.
5. Confirm the server uses PHP 8.1+ with `pdo_mysql` enabled.
6. Open `test_db.php` in the browser once. It should report a successful connection. Delete or restrict this diagnostic file after testing.

The `.htaccess` file blocks browser access to `.env` and `*.key` files on Apache/cPanel.

## TiDB Cloud + Vercel

Use `DB_HOST`, `DB_PORT=4000`, `DB_NAME`, `DB_USER`, and `DB_PASS` as Vercel Environment Variables. TiDB requires TLS; download its CA certificate from the Connect dialog, encode it as Base64, and save it in `DB_SSL_CA_BASE64`.

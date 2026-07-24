# GIZMO game landing page

Open `index.html` through XAMPP (for example `http://localhost/GIZMO/`) to play the memory game and use the email account flow. Accounts are stored locally in the browser for this prototype.

## Enabling real Google sign-in

1. Create a Web OAuth client in Google Cloud Console.
2. Add your local and production URLs to **Authorized JavaScript origins**.
3. At the top of `app.js`, before the existing code, add:

```js
window.GIZMO_GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
```

The Google button will then invoke Google Identity Services. For a production app, send the returned ID token to a backend and validate it there before creating a user session.

**OpenAI API Key**

- **Add via .htaccess (XAMPP/Apache):** Edit `.htaccess` in the project root and set `SetEnv OPENAI_API_KEY "your_key_here"`. Restart Apache.
- **Add via .env file (project-local):** Create a file named `.env` in the project root with the line `OPENAI_API_KEY=your_key_here`.
- **Add as system environment variable:** On Windows, add `OPENAI_API_KEY` in System Properties → Environment Variables, then restart Apache/XAMPP.
- `config.php` now reads `OPENAI_API_KEY` from the environment or `.env` and defines the `OPENAI_API_KEY` constant for server-side code.

Replace `your_key_here` with the actual OpenAI API key. Keep secrets out of version control.

**Quick CLI helper**

If you prefer a CLI helper that writes `.env` for you (recommended for local development), run from the project root:

```bash
php set_openai_key.php "your_real_openai_key"
```

This creates/overwrites `.env` with `OPENAI_API_KEY=...`. Restart Apache/XAMPP afterwards. Do not paste your key into public places.

# Google Sign-In setup

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/clients).
2. Create/select a project and complete **Branding**:
   - App name: `QUESTER`
   - Add your support/developer email.
3. Under **Audience**, use External and add your Google account as a test user while the app is in testing.
4. Create an **OAuth client** with application type **Web application**.
5. Add every site origin that will show the login:
   - `http://localhost`
   - `http://localhost:80` only if Google accepts the explicit port
   - Your production origin, for example `https://your-domain.com`
   - Your Vercel production origin, if used
6. Copy the Web Client ID (it ends in `.apps.googleusercontent.com`).
7. Configure it:
   - XAMPP: set `GOOGLE_CLIENT_ID=...` in the root `.env`.
   - Vercel: Project Settings → Environment Variables → add `GOOGLE_CLIENT_ID`, then redeploy.
   - cPanel: set the same value in the deployed root `.env`.
8. Restart Apache after changing the local `.env`, then test in a private browser window.

Do not use a Client Secret in the browser. This integration only needs the Web Client ID; the backend validates the Google ID token before trusting the profile.

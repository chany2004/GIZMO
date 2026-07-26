# Google Sign-In setup

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/clients).
2. Create/select a project and complete **Branding**:
   - App name: `QUESTER`
   - Add your support/developer email.
3. Under **Audience**, use External and add your Google account as a test user while the app is in testing.
4. Create an **OAuth client** with application type **Web application**.
5. Under **Authorized JavaScript origins**, add every site origin that will show the login:
   - `http://localhost`
   - `http://localhost:80` only if Google accepts the explicit port
   - `https://gizmo-yccu.vercel.app`
   - Any other production origin that will show the same login
   - Use only the scheme and host: no path, query, trailing wildcard, or room URL.
   - This app uses popup mode with a JavaScript callback, so an Authorized
     redirect URI is not required.
6. Copy the Web Client ID (it ends in `.apps.googleusercontent.com`).
7. Configure it:
   - XAMPP: set `GOOGLE_CLIENT_ID=...` in the root `.env`.
   - Vercel: Project Settings → Environment Variables → add the key
     `GOOGLE_CLIENT_ID`; its value must be only the raw client ID, then redeploy.
   - cPanel: set the same value in the deployed root `.env`.
8. Restart Apache after changing the local `.env`, then test in a private browser window.

Do not use a Client Secret in the browser. This integration only needs the Web Client ID; the backend validates the Google ID token before trusting the profile.

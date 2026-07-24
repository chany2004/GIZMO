# GIZMO — Study & Game System 🧠🎮

## 🚀 Deploy to Vercel

### Option 1: Static Only (No Backend)
The app works fully offline on Vercel without PHP/MySQL:
- ✅ Solo trivia quizzes
- ✅ Study flashcards (create, flip, quiz)
- ✅ AI Chat UI (with Groq/Gemini key via config.js)
- ✅ LocalStorage login/scores
- ⚠️ Multiplayer rooms (requires MySQL)

**Just push to Vercel — no setup needed!**

### Option 2: Full Stack (With Database)
1. Create a free MySQL database at [PlanetScale](https://planetscale.com)
2. Import `database/gizmo.sql` via PlanetScale console
3. In Vercel Project Settings → Environment Variables:
   ```
   DB_HOST=your-planetscale-host
   DB_NAME=GIZMO
   DB_USER=your-username
   DB_PASS=your-password
   ```
4. Deploy!

## 🏠 Local Development (XAMPP)
1. Start Apache + MySQL in XAMPP
2. Import `database/gizmo.sql` via phpMyAdmin
3. Access via `http://localhost/GIZMO`

## 📁 Project Structure
```
GIZMO/
├── index.html          # Homepage
├── game.html           # Multiplayer game
├── study.html          # Study flashcards
├── dashboard.html      # User dashboard
├── api.php             # Unified API endpoint (Vercel & XAMPP)
├── config.php          # Auto-detects XAMPP vs Vercel
├── helpers.php         # Shared PHP functions
├── js/config.js        # API routing (Vercel fallback)
├── vercel.json         # Vercel deployment config
├── styles.css          # Global styles
├── game.css            # Game UI
├── study.css           # Study UI (enhanced)
├── trivia.css          # Quiz UI (enhanced)
├── lobby.css           # Lobby UI (enhanced)
└── database/gizmo.sql  # MySQL schema
```


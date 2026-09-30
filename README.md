# 🩺 NEET 2027 Master Study Tracker - Full-Stack App

A full-stack, responsive NEET preparation web app built with Node.js and Express, pre-loaded with the complete NCERT Class 11 & 12 syllabus, coaching test score log, daily question tracker, streak counter, and backup system.

## Run locally

Install dependencies:

```powershell
npm install
```

Start the API server in one terminal:

```powershell
npm start
```

Start the React development frontend in a second terminal:

```powershell
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests to Express on port 3000.

For a production-style local run:

```powershell
npm run build
npm start
```

Express serves the React build from `dist/` when it exists and falls back to the legacy `public/` frontend otherwise. Set `MONGODB_URI` when using MongoDB Atlas; without it, the app uses `data/db.json` locally.


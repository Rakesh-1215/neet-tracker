# 🩺 NEET 2027 Master Study Tracker - Full-Stack App

A full-stack, responsive NEET preparation web app built with Node.js and Express, pre-loaded with the complete NCERT Class 11 & 12 syllabus, coaching test score log, daily question tracker, streak counter, and backup system.

---

## 🚀 How to Run Locally

1. Open your terminal in this directory (`C:\Users\rakesh\.gemini\antigravity\scratch\neet-tracker`).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open your browser at:
   ```
   http://localhost:3000
   ```

---

## 🌐 How to Make it Live on Render (Free Deployment Guide)

Follow these simple steps to deploy your live website for your brother so he can access it from his **Mobile Phone, Laptop, or Tablet**:

### Step 1: Upload Project to GitHub
1. Create a free account on [GitHub](https://github.com).
2. Create a new repository named `neet-study-tracker`.
3. Push/upload all project files from `neet-tracker/` folder to your GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for NEET Study Tracker"
   git branch -M main
   git remote add origin https://github.com/<your-username>/neet-study-tracker.git
   git push -u origin main
   ```

### Step 2: Deploy to Render
1. Go to [render.com](https://render.com) and create a free account (Sign in with GitHub).
2. Click the **New +** button in top right and select **Web Service**.
3. Select **Build and deploy from a Git repository**, then choose your `neet-study-tracker` repository.
4. Fill in the deployment details:
   - **Name**: `neet-study-tracker`
   - **Region**: Select any region closest to you (e.g., Singapore or Frankfurt)
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. Click **Create Web Service**.

Render will now automatically install dependencies, build the app, and give you a live URL (e.g., `https://neet-study-tracker.onrender.com`)!

---

## 📱 Features Included

- 📚 **Pre-loaded NCERT Syllabus**: ~95 NCERT chapters for 11th & 12th Physics, Chemistry, Botany, and Zoology with Theory, Exemplar, PYQs, and Revision tracking.
- 📝 **Coaching Test Scores Keeper**: Log Allen/Aakash/PW mock test scores out of 720 with automatic total mark calculation and accuracy %.
- 🔥 **Streak & Goal Tracker**: Active streak tracking, daily question counters, and study hours goals.
- ⚙️ **CSV Export & JSON Backup**: Download study logs to Excel or backup files to transfer data.

# Testbench Setup & Run Guide

This folder contains the steps and files needed to test the project quickly.

## Prerequisites
- Node.js 18+ (recommended)
- npm 9+ (or equivalent package manager)
- Ollama installed and running locally
- Model pulled: `deepseek-v3.1:671b-cloud`

## 1) Clone and Install
```bash
git clone <YOUR_PUBLIC_GITHUB_REPO_URL>
cd <YOUR_REPO_NAME>
npm install
```

## 2) Configure Environment
Create a `.env` file at the repo root with:
```env
OLLAMA_BASE_URL="http://127.0.0.1:11434"
OLLAMA_MODEL="deepseek-v3.1:671b-cloud"
JWT_SECRET="change-this-in-real-deploy"
APP_URL="http://localhost:3000"
```

## 3) Start the App
```bash
npm run dev
```
The app will start at:
```
http://localhost:3000
```

## 4) Quick Test Flow
1. Register a new account at `/register`.
2. Create a subject (e.g., Mathematics).
3. Add a topic and optionally upload a PDF or text context.
4. Start a quiz for the topic and submit answers.
5. Open **Report** to see analytics and AI insights.
6. Open **Calendar** to:
   - Add study sessions or deadlines
   - Use AI suggestions and chat
   - Start a quiz directly from an event
7. Return to **Dashboard** to see proactive suggestions.

## 5) Optional: Pull the Model
If the model is not installed, run:
```bash
ollama pull deepseek-v3.1:671b-cloud
```

## Notes
- The database is created automatically as `learning_platform.db` at first run.
- AI features require Ollama running locally.
- If port 3000 is busy, set a different port in `server.ts`.

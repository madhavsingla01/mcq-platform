# Universal MCQ Quiz Platform

A production-ready full-stack MERN application that lets users upload tabular MCQ files (Excel, CSV, JSON), automatically detect question structures, map columns, and generate interactive quizzes.

## Tech Stack

- **Frontend**: React + Vite + TailwindCSS v4 + Zustand
- **Backend**: Node.js + Express + MongoDB + Mongoose
- **Parsing**: SheetJS (xlsx) + PapaParse

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### Backend
```bash
cd server
npm install
cp .env.example .env   # Edit with your MongoDB URI
npm run dev
```

### Frontend
```bash
cd client
npm install
npm run dev
```

### Docker (MongoDB + Redis)
```bash
docker-compose up -d
```

## Project Structure

```
mcq-platform/
├── client/          # React frontend
├── server/          # Express backend
├── docs/            # Documentation
├── docker-compose.yml
└── README.md
```

## Features

- 📤 Upload Excel, CSV, JSON MCQ files
- 🧠 Smart column detection & mapping
- ✏️ Manual mapping correction UI
- 📝 Interactive quiz interface
- 📊 Results & explanations
- 🔐 JWT authentication
- 🌐 Community features (architecture-ready)
- 🤖 AI explanations (architecture-ready)

## License

MIT

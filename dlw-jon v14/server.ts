import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { initDb } from './server/db';
import authRoutes from './server/routes/auth';
import subjectRoutes from './server/routes/subjects';
import topicRoutes from './server/routes/topics';
import questionRoutes from './server/routes/questions';
import quizRoutes from './server/routes/quiz';
import reportRoutes from './server/routes/report';
import calendarRoutes from './server/routes/calendar';
import contextRoutes from './server/routes/context';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Database
  initDb();

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/subjects', subjectRoutes);
  app.use('/api/topics', topicRoutes);
  app.use('/api/questions', questionRoutes);
  app.use('/api/quiz', quizRoutes);
  app.use('/api/report', reportRoutes);
  app.use('/api/calendar', calendarRoutes);
  app.use('/api/contexts', contextRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', environment: 'Node.js/Express/SQLite' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

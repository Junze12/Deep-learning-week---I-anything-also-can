import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';

// Register
router.post('/register', (req, res) => {
  try {
    const { name, email, password, learning_profile } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const salt = bcrypt.genSaltSync(10);
    const password_hash = bcrypt.hashSync(password, salt);

    const info = db.prepare(`
      INSERT INTO users (name, email, password_hash, exam_date, preferred_study_time_per_day, target_grade)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      name,
      email,
      password_hash,
      learning_profile?.exam_date || null,
      learning_profile?.preferred_study_time_per_day ?? null,
      learning_profile?.target_grade || null
    );

    const token = jwt.sign({ id: info.lastInsertRowid, email }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      token,
      user: {
        id: info.lastInsertRowid, name, email,
        learning_profile: {
          exam_date: learning_profile?.exam_date,
          target_grade: learning_profile?.target_grade,
          preferred_study_time_per_day: learning_profile?.preferred_study_time_per_day,
        }
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }

    const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

    const learning_profile = {
      preferred_study_time_per_day: user.preferred_study_time_per_day,
      exam_date: user.exam_date,
      target_grade: user.target_grade
    };

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, learning_profile }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

import { Router } from 'express';
import db from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Get questions by topic
router.get('/', authenticateToken, (req: AuthRequest, res) => {
  try {
    const { topic_id } = req.query;
    if (!topic_id) {
      return res.status(400).json({ error: 'topic_id is required' });
    }

    // Verify ownership
    const topic: any = db.prepare(`
      SELECT t.* FROM topics t
      JOIN subjects s ON t.subject_id = s.id
      WHERE t.id = ? AND s.user_id = ?
    `).get(topic_id, req.user!.id);

    if (!topic) {
      return res.status(403).json({ error: 'Unauthorized access to topic' });
    }

    const questions = db.prepare('SELECT * FROM questions WHERE topic_id = ?').all(topic_id);
    
    // Parse JSON fields
    const parsedQuestions = questions.map((q: any) => ({
      ...q,
      options: JSON.parse(q.options),
      concept_tags: q.concept_tags ? JSON.parse(q.concept_tags) : []
    }));

    res.json(parsedQuestions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// Add question
router.post('/', authenticateToken, (req: AuthRequest, res) => {
  try {
    const { topic_id, question_text, options, correct_answer, difficulty, concept_tags } = req.body;

    if (!topic_id || !question_text || !options || !correct_answer) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify ownership
    const topic: any = db.prepare(`
      SELECT t.* FROM topics t
      JOIN subjects s ON t.subject_id = s.id
      WHERE t.id = ? AND s.user_id = ?
    `).get(topic_id, req.user!.id);

    if (!topic) {
      return res.status(403).json({ error: 'Unauthorized access to topic' });
    }

    const info = db.prepare(`
      INSERT INTO questions (topic_id, question_text, options, correct_answer, difficulty, concept_tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      topic_id,
      question_text,
      JSON.stringify(options),
      correct_answer,
      difficulty || 1,
      JSON.stringify(concept_tags || [])
    );

    res.status(201).json({
      id: info.lastInsertRowid,
      topic_id,
      question_text,
      options,
      correct_answer,
      difficulty: difficulty || 1,
      concept_tags: concept_tags || []
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

// Upload questions via JSON or CSV
router.post('/upload', authenticateToken, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const { topic_id } = req.body;
    const file = req.file;

    if (!topic_id || !file) {
      return res.status(400).json({ error: 'Topic ID and file are required' });
    }

    // Verify ownership
    const topic: any = db.prepare(`
      SELECT t.* FROM topics t
      JOIN subjects s ON t.subject_id = s.id
      WHERE t.id = ? AND s.user_id = ?
    `).get(topic_id, req.user!.id);

    if (!topic) {
      return res.status(403).json({ error: 'Unauthorized access to topic' });
    }

    const questionsToInsert: any[] = [];
    const ext = path.extname(file.originalname).toLowerCase();

    if (ext === '.json') {
      const data = fs.readFileSync(file.path, 'utf8');
      const jsonQuestions = JSON.parse(data);
      if (!Array.isArray(jsonQuestions)) {
        throw new Error('JSON file must contain an array of questions');
      }
      questionsToInsert.push(...jsonQuestions);
    } else if (ext === '.csv') {
      await new Promise((resolve, reject) => {
        fs.createReadStream(file.path)
          .pipe(csv())
          .on('data', (row) => {
            // CSV format: question_text, option1, option2, option3, option4, correct_answer, difficulty
            const options = [row.option1, row.option2, row.option3, row.option4].filter(Boolean);
            questionsToInsert.push({
              question_text: row.question_text,
              options: options,
              correct_answer: row.correct_answer,
              difficulty: parseInt(row.difficulty) || 1,
              concept_tags: row.concept_tags ? row.concept_tags.split(',').map((t: string) => t.trim()) : []
            });
          })
          .on('end', resolve)
          .on('error', reject);
      });
    } else {
      return res.status(400).json({ error: 'Unsupported file format. Use JSON or CSV.' });
    }

    // Insert questions
    const insertStmt = db.prepare(`
      INSERT INTO questions (topic_id, question_text, options, correct_answer, difficulty, concept_tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((questions) => {
      for (const q of questions) {
        insertStmt.run(
          topic_id,
          q.question_text,
          JSON.stringify(q.options),
          q.correct_answer,
          q.difficulty || 1,
          JSON.stringify(q.concept_tags || [])
        );
      }
    });

    transaction(questionsToInsert);

    // Cleanup
    fs.unlinkSync(file.path);

    res.status(201).json({ message: `Successfully imported ${questionsToInsert.length} questions` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to upload questions' });
  }
});

export default router;

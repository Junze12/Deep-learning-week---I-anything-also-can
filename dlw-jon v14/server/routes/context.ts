import { Router } from 'express';
import db from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Get contexts by topic
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

    const contexts = db.prepare('SELECT * FROM contexts WHERE topic_id = ? ORDER BY created_at DESC').all(topic_id);
    res.json(contexts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contexts' });
  }
});

// Add context (Text or PDF)
router.post('/', authenticateToken, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const { topic_id, content, type } = req.body;
    const file = req.file;

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

    let contextContent = '';
    let sourceType = 'text';
    let filename = null;

    if (file) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.pdf') {
        const dataBuffer = fs.readFileSync(file.path);
        const data = await pdf(dataBuffer);
        contextContent = data.text;
        sourceType = 'pdf';
        filename = file.originalname;

        // Cleanup
        fs.unlinkSync(file.path);
      } else {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: 'Only PDF files are supported for file upload' });
      }
    } else if (content) {
      contextContent = content;
      sourceType = 'text';
    } else {
      return res.status(400).json({ error: 'Content or file is required' });
    }

    const info = db.prepare(`
      INSERT INTO contexts (topic_id, content, source_type, filename)
      VALUES (?, ?, ?, ?)
    `).run(topic_id, contextContent, sourceType, filename);

    res.status(201).json({
      id: info.lastInsertRowid,
      topic_id,
      content: contextContent.slice(0, 500) + (contextContent.length > 500 ? '...' : ''),
      source_type: sourceType,
      filename,
      created_at: new Date().toISOString()
    });

  } catch (error) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to add context' });
  }
});

export default router;

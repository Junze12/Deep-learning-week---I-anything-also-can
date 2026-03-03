import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import db from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Get topics by subject
router.get('/', authenticateToken, (req: AuthRequest, res) => {
  try {
    const { subject_id } = req.query;
    if (!subject_id) {
      return res.status(400).json({ error: 'subject_id is required' });
    }

    // Verify ownership of subject
    const subject = db.prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?').get(subject_id, req.user!.id);
    if (!subject) {
      return res.status(403).json({ error: 'Unauthorized access to subject' });
    }

    const topics = db.prepare('SELECT * FROM topics WHERE subject_id = ?').all(subject_id);
    
    // Fetch documents for each topic
    const topicsWithDocs = topics.map((topic: any) => {
      const documents = db.prepare('SELECT * FROM documents WHERE topic_id = ?').all(topic.id);
      return { ...topic, documents };
    });

    res.json(topicsWithDocs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

// Add topic with optional file upload
router.post('/', authenticateToken, upload.array('documents'), async (req: AuthRequest, res) => {
  try {
    const { subject_id, topic_name, description, goal, weight } = req.body;
    const files = req.files as Express.Multer.File[];

    if (!subject_id || !topic_name) {
      return res.status(400).json({ error: 'subject_id and topic_name are required' });
    }

    // Verify ownership
    const subject = db.prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?').get(subject_id, req.user!.id);
    if (!subject) {
      return res.status(403).json({ error: 'Unauthorized access to subject' });
    }

    const info = db.prepare('INSERT INTO topics (subject_id, topic_name, description, goal, weight) VALUES (?, ?, ?, ?, ?)').run(
      subject_id,
      topic_name,
      description || null,
      goal || null,
      weight || 1
    );

    const topicId = info.lastInsertRowid;
    const uploadedDocs: any[] = [];

    if (files && files.length > 0) {
      const insertDoc = db.prepare('INSERT INTO documents (topic_id, filename, file_path) VALUES (?, ?, ?)');
      const insertContext = db.prepare('INSERT INTO contexts (topic_id, content, source_type, filename) VALUES (?, ?, ?, ?)');
      for (const file of files) {
        insertDoc.run(topicId, file.originalname, file.path);
        uploadedDocs.push({ filename: file.originalname, file_path: file.path });

        if (path.extname(file.originalname).toLowerCase() === '.pdf') {
          try {
            const dataBuffer = fs.readFileSync(file.path);
            const data = await pdf(dataBuffer);
            if (data.text?.trim()) {
              insertContext.run(topicId, data.text, 'pdf', file.originalname);
            }
          } catch (pdfErr) {
            console.error('PDF extraction failed for', file.originalname, pdfErr);
          }
        }
      }
    }

    res.status(201).json({
      id: topicId,
      subject_id,
      topic_name,
      description,
      goal,
      weight: weight || 1,
      documents: uploadedDocs
    });
  } catch (error) {
    console.error('Create topic error:', error);
    res.status(500).json({ error: 'Failed to create topic' });
  }
});

export default router;

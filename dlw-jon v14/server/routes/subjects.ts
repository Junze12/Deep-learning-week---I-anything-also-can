import { Router } from 'express';
import db from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { computeBKTMastery, BKTResponse } from '../lib/bkt';
import { generateText } from '../lib/ai';

const MODEL = process.env.OLLAMA_MODEL ?? 'deepseek-v3.1:671b-cloud';

const router = Router();

// Get all subjects for logged-in user
router.get('/', authenticateToken, (req: AuthRequest, res) => {
  try {
    const subjects = db.prepare('SELECT * FROM subjects WHERE user_id = ? ORDER BY created_at DESC').all(req.user!.id);
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

// Create subject
router.post('/', authenticateToken, (req: AuthRequest, res) => {
  try {
    const { subject_name, exam_date, target_grade } = req.body;
    
    if (!subject_name) {
      return res.status(400).json({ error: 'Subject name is required' });
    }

    const info = db.prepare('INSERT INTO subjects (user_id, subject_name, exam_date, target_grade) VALUES (?, ?, ?, ?)').run(
      req.user!.id,
      subject_name,
      exam_date || null,
      target_grade || null
    );

    res.status(201).json({
      id: info.lastInsertRowid,
      user_id: req.user!.id,
      subject_name,
      exam_date,
      target_grade,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create subject' });
  }
});

// Subject-level AI Study Coach chat
// POST /api/subjects/:subjectId/chat
router.post('/:subjectId/chat', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const subjectId = parseInt(req.params.subjectId);
    const { chat_history, user_message } = req.body;
    const userId = req.user!.id;

    if (!user_message) return res.status(400).json({ error: 'user_message is required' });

    // Verify ownership
    const subject: any = db.prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?').get(subjectId, userId);
    if (!subject) return res.status(403).json({ error: 'Unauthorized' });

    // Topics with question counts and document filenames
    const topics: any[] = db.prepare(`
      SELECT t.id, t.topic_name, t.description, t.goal,
             COUNT(DISTINCT q.id) as question_count,
             GROUP_CONCAT(DISTINCT d.filename) as doc_names
      FROM topics t
      LEFT JOIN questions q ON q.topic_id = t.id
      LEFT JOIN documents d ON d.topic_id = t.id
      WHERE t.subject_id = ?
      GROUP BY t.id
    `).all(subjectId);

    // Per-topic BKT mastery from full attempt history
    const topicAttempts: any[] = db.prepare(`
      SELECT a.topic_id, a.correct, a.confidence_level
      FROM attempts a
      JOIN topics t ON a.topic_id = t.id
      WHERE a.user_id = ? AND t.subject_id = ?
      ORDER BY a.topic_id, a.attempt_timestamp ASC
    `).all(userId, subjectId);

    const byTopic = new Map<number, BKTResponse[]>();
    for (const row of topicAttempts) {
      if (!byTopic.has(row.topic_id)) byTopic.set(row.topic_id, []);
      byTopic.get(row.topic_id)!.push({ correct: row.correct === 1, confidence: row.confidence_level ?? null });
    }
    const topicMasteryMap = new Map<number, number>();
    for (const [tid, responses] of byTopic.entries()) {
      topicMasteryMap.set(tid, computeBKTMastery(responses));
    }

    // Weak concept tags for this user
    const weakConcepts: any[] = db.prepare(`
      SELECT concept_tag, mastery FROM concept_mastery
      WHERE user_id = ? AND mastery < 0.7
      ORDER BY mastery ASC LIMIT 10
    `).all(userId);

    // Recent activity for this subject (7 days)
    const recentActivity: any = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN a.correct = 1 THEN 1 ELSE 0 END) as correct
      FROM attempts a
      JOIN topics t ON a.topic_id = t.id
      WHERE a.user_id = ? AND t.subject_id = ? AND a.attempt_timestamp >= date('now', '-7 days')
    `).get(userId, subjectId);

    // Student profile
    const student: any = db.prepare(
      'SELECT preferred_study_time_per_day, target_grade FROM users WHERE id = ?'
    ).get(userId);

    // Overall subject mastery (all attempts flattened)
    const allResponses: BKTResponse[] = topicAttempts.map(a => ({
      correct: a.correct === 1,
      confidence: a.confidence_level ?? null,
    }));
    const overallMastery = allResponses.length > 0 ? computeBKTMastery(allResponses) : null;

    // Build topics block
    const topicsBlock = topics.length > 0
      ? topics.map((t: any) => {
          const mastery = topicMasteryMap.get(t.id);
          const masteryStr = mastery !== undefined ? `${Math.round(mastery * 100)}% mastery` : 'not attempted yet';
          const docList = t.doc_names ? (t.doc_names as string).split(',').map((f: string) => f.trim()).filter(Boolean) : [];
          const docStr = docList.length > 0 ? `, study materials: ${docList.join(', ')}` : '';
          const parts = [`- **${t.topic_name}** (${masteryStr}, ${t.question_count} questions${docStr})`];
          if (t.description) parts.push(`  Description: ${t.description}`);
          if (t.goal) parts.push(`  Goal: ${t.goal}`);
          return parts.join('\n');
        }).join('\n')
      : '- No topics added yet.';

    // Build performance block
    const perfLines: string[] = [];
    if (overallMastery !== null) {
      perfLines.push(`- Overall BKT mastery in this subject: ${Math.round(overallMastery * 100)}%`);
    }
    if (recentActivity?.total > 0) {
      const acc = Math.round((recentActivity.correct / recentActivity.total) * 100);
      perfLines.push(`- Last 7 days: ${recentActivity.total} questions answered, ${acc}% accuracy`);
    }
    if (weakConcepts.length > 0) {
      perfLines.push(
        `- Weak concepts (mastery < 70%): ${weakConcepts.map((c: any) => `"${c.concept_tag}" (${Math.round(c.mastery * 100)}%)`).join(', ')}`
      );
    }

    const systemPrompt = `You are STUDY_COACH, a knowledgeable and supportive AI tutor helping a student study.

SUBJECT: ${subject.subject_name}${subject.exam_date ? `\nEXAM DATE: ${subject.exam_date}` : ''}${subject.target_grade ? `\nTARGET GRADE: ${subject.target_grade}` : ''}

STUDENT PROFILE:${student?.target_grade ? `\n- Target grade: ${student.target_grade}` : ''}${student?.preferred_study_time_per_day ? `\n- Daily study goal: ${student.preferred_study_time_per_day} minutes` : ''}

TOPICS IN THIS SUBJECT:
${topicsBlock}
${perfLines.length > 0 ? `\nPERFORMANCE SNAPSHOT:\n${perfLines.join('\n')}` : ''}

RULES:
1. Only discuss content relevant to ${subject.subject_name} and the topics listed above — do not go off-topic.
2. Reference the student's actual mastery data when giving advice — be specific, not generic.
3. For topics not yet attempted, explain why starting there matters and suggest a first step.
4. Adapt explanation depth to the student's apparent mastery level per topic.
5. Suggest concrete actions (e.g. "Try the quiz on X", "Re-read the concept behind Y").
6. Keep responses concise unless the student asks for detail.`;

    const formattedHistory = ((chat_history as { role: string; content: string }[]) || [])
      .map(m => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.content}`)
      .join('\n\n');

    const fullPrompt = `${systemPrompt}
${formattedHistory ? `\n---\nCONVERSATION SO FAR:\n${formattedHistory}\n---` : ''}
Student: ${user_message}
Coach:`;

    const reply = await generateText(fullPrompt, { model: MODEL });
    res.json({ reply });
  } catch (error) {
    console.error('Subject chat error:', error);
    res.status(500).json({ error: 'Failed to generate reply' });
  }
});

export default router;

import { Router } from 'express';
import db from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { generateText } from '../lib/ai';

const router = Router();

// Get all calendar events for the user
router.get('/', authenticateToken, (req: AuthRequest, res) => {
  try {
    const events = db.prepare(`
      SELECT 
        ce.id,
        ce.event_date,
        ce.event_time,
        ce.event_type,
        ce.title,
        ce.remarks,
        ce.topic_id,
        s.subject_name,
        t.topic_name
      FROM calendar_events ce
      JOIN subjects s ON ce.subject_id = s.id
      LEFT JOIN topics t ON ce.topic_id = t.id
      WHERE ce.user_id = ?
      ORDER BY ce.event_date ASC, ce.event_time ASC
    `).all(req.user!.id);
    res.json(events);
  } catch (error) {
    console.error('Fetch events error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

// Create a new calendar event
router.post('/', authenticateToken, (req: AuthRequest, res) => {
  try {
    const { subject_id, topic_id, event_date, event_time, remarks, event_type, title } = req.body;

    if (!subject_id || !event_date || !event_time) {
      return res.status(400).json({ error: 'Subject, date, and time are required' });
    }

    const info = db.prepare(`
      INSERT INTO calendar_events (user_id, subject_id, topic_id, event_date, event_time, event_type, title, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user!.id,
      subject_id,
      topic_id || null,
      event_date,
      event_time,
      event_type || 'study',
      title || null,
      remarks || null
    );

    res.status(201).json({
      id: info.lastInsertRowid,
      user_id: req.user!.id,
      subject_id,
      topic_id,
      event_date,
      event_time,
      event_type: event_type || 'study',
      title: title || null,
      remarks
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create calendar event' });
  }
});

// Delete a calendar event
router.delete('/:id', authenticateToken, (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM calendar_events WHERE id = ? AND user_id = ?').run(id, req.user!.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// AI-powered study date suggestions based on weak topics
router.post('/suggest-dates', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    // Get user's weak topics (mastery < 50%)
    const weakTopics = db.prepare(`
      SELECT t.id, t.topic_name, t.mastery_score, s.subject_name, s.id as subject_id
      FROM topics t
      JOIN subjects s ON t.subject_id = s.id
      WHERE s.user_id = ? AND t.mastery_score IS NOT NULL AND t.mastery_score < 0.5
      ORDER BY t.mastery_score ASC
      LIMIT 5
    `).all(userId) as any[];

    // Get user's exam dates
    const userInfo = db.prepare(`
      SELECT exam_date, preferred_study_time_per_day FROM users WHERE id = ?
    `).get(userId) as any;

    const subjectExamDates = db.prepare(`
      SELECT subject_name, exam_date FROM subjects WHERE user_id = ? AND exam_date IS NOT NULL
    `).all(userId) as any[];

    // Get existing calendar events to avoid conflicts
    const existingEvents = db.prepare(`
      SELECT event_date, event_time FROM calendar_events WHERE user_id = ?
    `).all(userId) as any[];

    const prompt = `You are a study planner AI. Based on the student's weak topics and exam dates, suggest optimal study sessions for the next 14 days.

STUDENT CONTEXT:
- Preferred daily study time: ${userInfo?.preferred_study_time_per_day || 60} minutes
${userInfo?.exam_date ? `- Main exam date: ${userInfo.exam_date}` : ''}
${subjectExamDates.length > 0 ? `- Subject exam dates:\n${subjectExamDates.map(s => `  - ${s.subject_name}: ${s.exam_date}`).join('\n')}` : ''}

WEAK TOPICS (prioritise these):
${weakTopics.length > 0
  ? weakTopics.map(t => `  - ${t.topic_name} (${t.subject_name}): ${Math.round((t.mastery_score || 0) * 100)}% mastery`).join('\n')
  : '  No weak topics identified yet. Suggest general review sessions.'}

EXISTING EVENTS (avoid scheduling conflicts):
${existingEvents.length > 0
  ? existingEvents.map(e => `  - ${e.event_date} at ${e.event_time}`).join('\n')
  : '  No existing events'}

Respond with a single JSON object in this format:
{
  "suggestions": [
    {
      "subject_name": "exact subject name from above",
      "topic_name": "exact topic name or null if general review",
      "event_date": "YYYY-MM-DD",
      "event_time": "HH:MM (use morning 09:00 or afternoon 14:00 slots)",
      "event_type": "study",
      "title": "optional short title for the session",
      "remarks": "brief reason for this session"
    }
  ],
  "summary": "2-4 sentences explaining why these sessions were chosen, grounded in the student's mastery, exam dates, and existing events."
}

Rules:
1. Suggest 3-5 sessions spread over the next 14 days
2. Space sessions at least 1-2 days apart
3. Prioritise topics with lowest mastery
4. Consider exam dates if provided (earlier for subjects with earlier exams)
5. Suggest morning (09:00) or afternoon (14:00) sessions
6. Return ONLY valid JSON, no markdown formatting`;

    const text = await generateText(prompt);

    let suggestions: any[] = [];
    let summary = '';
    try {
      // Extract JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        const parsed = JSON.parse(objMatch[0]);
        if (Array.isArray(parsed?.suggestions)) suggestions = parsed.suggestions;
        if (typeof parsed?.summary === 'string') summary = parsed.summary;
      } else if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('Failed to parse AI suggestions:', parseError);
      return res.status(500).json({ error: 'Failed to parse AI suggestions' });
    }

    if (summary) {
      db.prepare(
        'INSERT INTO calendar_ai_chat (user_id, role, content) VALUES (?, ?, ?)'
      ).run(userId, 'assistant', summary);
    }

    res.json({ suggestions, summary });
  } catch (error) {
    console.error('AI suggestions error:', error);
    res.status(500).json({ error: 'Failed to generate study suggestions' });
  }
});

// Calendar AI chat history
router.get('/chat/history', authenticateToken, (req: AuthRequest, res) => {
  try {
    const rows = db.prepare(`
      SELECT role, content, created_at
      FROM calendar_ai_chat
      WHERE user_id = ?
      ORDER BY id ASC
      LIMIT 100
    `).all(req.user!.id);
    res.json({ messages: rows });
  } catch (error) {
    console.error('Chat history error:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Calendar AI chat
router.post('/chat', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { message, subject_id } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    // Store user message
    db.prepare(
      'INSERT INTO calendar_ai_chat (user_id, role, content) VALUES (?, ?, ?)'
    ).run(userId, 'user', message.trim());

    // Optional subject context
    const subject = subject_id
      ? (db.prepare('SELECT subject_name, exam_date FROM subjects WHERE id = ? AND user_id = ?').get(subject_id, userId) as any)
      : null;

    const userInfo = db.prepare(`
      SELECT exam_date, preferred_study_time_per_day
      FROM users WHERE id = ?
    `).get(userId) as any;

    const subjectExamDates = db.prepare(`
      SELECT subject_name, exam_date FROM subjects
      WHERE user_id = ? AND exam_date IS NOT NULL
    `).all(userId) as any[];

    const weakTopics = db.prepare(`
      SELECT t.id, t.topic_name, t.mastery_score, s.subject_name
      FROM topics t
      JOIN subjects s ON t.subject_id = s.id
      WHERE s.user_id = ? AND t.mastery_score IS NOT NULL AND t.mastery_score < 0.5
      ORDER BY t.mastery_score ASC
      LIMIT 8
    `).all(userId) as any[];

    const upcomingEvents = db.prepare(`
      SELECT event_date, event_time, remarks, s.subject_name, t.topic_name
      FROM calendar_events ce
      JOIN subjects s ON ce.subject_id = s.id
      LEFT JOIN topics t ON ce.topic_id = t.id
      WHERE ce.user_id = ?
      ORDER BY ce.event_date ASC, ce.event_time ASC
      LIMIT 15
    `).all(userId) as any[];

    // Pull recent chat history for context
    const recent = db.prepare(`
      SELECT role, content FROM calendar_ai_chat
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 12
    `).all(userId).reverse() as { role: string; content: string }[];

    if (recent.length > 0) {
      const last = recent[recent.length - 1];
      if (last.role === 'user' && last.content.trim() === message.trim()) {
        recent.pop();
      }
    }

    const historyBlock = recent.length
      ? recent.map(m => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.content}`).join('\n\n')
      : '';

    const prompt = `You are CALENDAR_COACH, an expert study planner helping a student manage a study calendar.

ROLE: Answer scheduling questions, refine study plans, and propose realistic sessions. Be concise and actionable.

STUDENT CONTEXT:
- Preferred daily study time: ${userInfo?.preferred_study_time_per_day || 60} minutes
${userInfo?.exam_date ? `- Main exam date: ${userInfo.exam_date}` : ''}
${subject ? `- Current subject: ${subject.subject_name}${subject.exam_date ? ` (exam: ${subject.exam_date})` : ''}` : ''}
${subjectExamDates.length > 0 ? `- Subject exam dates:\n${subjectExamDates.map(s => `  - ${s.subject_name}: ${s.exam_date}`).join('\n')}` : ''}

WEAK TOPICS (prioritise these):
${weakTopics.length > 0
  ? weakTopics.map(t => `- ${t.topic_name} (${t.subject_name}): ${Math.round((t.mastery_score || 0) * 100)}% mastery`).join('\n')
  : '- None identified yet.'}

UPCOMING EVENTS:
${upcomingEvents.length > 0
  ? upcomingEvents.map(e => `- ${e.event_date} ${e.event_time}: ${e.subject_name}${e.topic_name ? ` - ${e.topic_name}` : ''}${e.remarks ? ` (${e.remarks})` : ''}`).join('\n')
  : '- None scheduled yet.'}

${historyBlock ? `CONVERSATION SO FAR:\n${historyBlock}\n` : ''}
STUDENT MESSAGE: ${message}

RULES:
1. If the student asks for a schedule, suggest 3-5 sessions over the next 14 days.
2. Avoid time conflicts with existing events above.
3. Use either 09:00 or 14:00 time slots unless the student specifies a different time.
4. Reference weak topics when relevant.
5. Keep the response short and practical.
6. Output ONLY valid JSON in this format:
{
  "reply": "your response to the student",
  "suggestions": [
    {
      "subject_name": "exact subject name from above",
      "topic_name": "exact topic name or null if general review",
      "event_date": "YYYY-MM-DD",
      "event_time": "HH:MM (09:00 or 14:00 unless specified)",
      "event_type": "study",
      "title": "optional short title for the session",
      "remarks": "brief reason for this session"
    }
  ]
}
If no new suggestions are needed, return an empty array for "suggestions".`;

    const text = await generateText(prompt);
    let reply = text;
    let suggestions: any[] = [];

    try {
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        const parsed = JSON.parse(objMatch[0]);
        if (typeof parsed?.reply === 'string') reply = parsed.reply;
        if (Array.isArray(parsed?.suggestions)) suggestions = parsed.suggestions;
      }
    } catch (parseError) {
      // Fallback to raw text if JSON parsing fails
    }

    db.prepare(
      'INSERT INTO calendar_ai_chat (user_id, role, content) VALUES (?, ?, ?)'
    ).run(userId, 'assistant', reply);

    res.json({ reply, suggestions });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to generate reply' });
  }
});

// Add multiple suggested events at once
router.post('/batch-add', authenticateToken, (req: AuthRequest, res) => {
  try {
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Events array is required' });
    }

    const insertedIds: number[] = [];
    const insertStmt = db.prepare(`
      INSERT INTO calendar_events (user_id, subject_id, topic_id, event_date, event_time, event_type, title, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const event of events) {
      // Find subject_id
      const subject = db.prepare('SELECT id FROM subjects WHERE user_id = ? AND subject_name = ?')
        .get(req.user!.id, event.subject_name) as any;

      if (!subject) continue;

      let topicId: number | null = null;
      if (event.topic_name) {
        const topic = db.prepare('SELECT id FROM topics WHERE subject_id = ? AND topic_name = ?')
          .get(subject.id, event.topic_name) as any;
        topicId = topic?.id || null;
      }

      const info = insertStmt.run(
        req.user!.id,
        subject.id,
        topicId,
        event.event_date,
        event.event_time,
        event.event_type || 'study',
        event.title || null,
        event.remarks || null
      );

      insertedIds.push(Number(info.lastInsertRowid));
    }

    res.json({ message: `${insertedIds.length} events added`, ids: insertedIds });
  } catch (error) {
    console.error('Batch add error:', error);
    res.status(500).json({ error: 'Failed to add events' });
  }
});

export default router;

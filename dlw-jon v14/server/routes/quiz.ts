import { Router } from 'express';
import db from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { computeBKTMastery, BKTResponse } from '../lib/bkt';
import { generateText } from '../lib/ai';

const router = Router();

const MODEL = process.env.OLLAMA_MODEL ?? 'deepseek-v3.1:671b-cloud';
const MAX_GEN_RETRIES = Math.max(1, parseInt(process.env.MAX_RETRIES ?? '3', 10));

function isRetryable(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return ['rate limit', 'quota', 'timeout', 'temporarily', 'unavailable', '429', '503'].some(k => msg.includes(k));
}

function backoffMs(attempt: number): number {
  return Math.min(8000, 500 * Math.pow(2, attempt - 1)); // 500ms → 1s → 2s → 4s → 8s
}

// 5) Static Quiz Mode
// GET /api/quiz?topic_id=<id>
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
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

    // Randomly select 5 questions
    let questions: any[] = db.prepare(`
      SELECT id, question_text, options, difficulty
      FROM questions
      WHERE topic_id = ?
      ORDER BY RANDOM()
      LIMIT 5
    `).all(topic_id);

    // No questions yet — generate 5 via AI and persist them
    if (questions.length === 0) {
      const subject: any = db.prepare('SELECT subject_name FROM subjects WHERE id = ?').get(topic.subject_id);

      // Fetch all uploaded context (PDFs, text notes) for this topic
      const contexts: any[] = db.prepare(
        'SELECT content, source_type, filename FROM contexts WHERE topic_id = ? ORDER BY created_at ASC'
      ).all(topic_id);

      // Build context block — cap total at 12,000 chars to stay within token limits
      const MAX_CONTEXT_CHARS = 12000;
      let contextBlock = '';
      if (contexts.length > 0) {
        let remaining = MAX_CONTEXT_CHARS;
        const parts: string[] = [];
        for (const ctx of contexts) {
          if (remaining <= 0) break;
          const label = ctx.source_type === 'pdf' ? `[PDF: ${ctx.filename}]` : '[Study Note]';
          const chunk = ctx.content.slice(0, remaining);
          parts.push(`${label}\n${chunk}`);
          remaining -= chunk.length;
        }
        contextBlock = parts.join('\n\n---\n\n');
      }

      // Performance history — calibrate difficulty using BKT mastery
      const subjectAttempts: any[] = db.prepare(`
        SELECT a.correct, a.confidence_level
        FROM attempts a
        JOIN topics t ON a.topic_id = t.id
        WHERE t.subject_id = ? AND a.user_id = ?
        ORDER BY a.attempt_timestamp ASC
      `).all(topic.subject_id, req.user!.id);

      const recentMisses: any[] = db.prepare(`
        SELECT DISTINCT q.question_text, q.correct_answer
        FROM attempts a
        JOIN questions q ON a.question_id = q.id
        WHERE a.topic_id = ? AND a.user_id = ? AND a.correct = 0
        ORDER BY a.attempt_timestamp DESC
        LIMIT 5
      `).all(topic_id, req.user!.id);

      let perfBlock = '';
      if (subjectAttempts.length > 0) {
        const bktResponses: BKTResponse[] = subjectAttempts.map((a: any) => ({
          correct: a.correct === 1,
          confidence: a.confidence_level ?? null,
        }));
        const mastery = computeBKTMastery(bktResponses);
        const masteryPct = Math.round(mastery * 100);
        const difficultyGuidance =
          mastery < 0.50 ? 'The student is struggling — prioritise foundational questions (difficulty 1–2) to reinforce core understanding.' :
          mastery < 0.70 ? 'The student is progressing — use a mix of difficulty 2–3.' :
                           'The student performs well — lean toward difficulty 3–4 to challenge deeper understanding.';
        perfBlock = `\n\nSTUDENT PROFILE:\n- BKT mastery estimate for this subject: ${masteryPct}% (${subjectAttempts.length} attempts)\n  → ${difficultyGuidance}`;
        if (recentMisses.length > 0) {
          perfBlock += `\n\nRECENTLY MISSED IN THIS TOPIC:\n`;
          perfBlock += recentMisses.map((m: any) => `- "${m.question_text}" (correct: ${m.correct_answer})`).join('\n');
          perfBlock += '\n  → Do not repeat these exact questions. Probe the underlying concepts from a different angle.';
        }
      }

      // Weak concept_tags from persistent concept_mastery (cross-session signal)
      const weakConcepts: any[] = db.prepare(`
        SELECT concept_tag, mastery FROM concept_mastery
        WHERE user_id = ? AND mastery < 0.5
        ORDER BY mastery ASC LIMIT 8
      `).all(req.user!.id);
      if (weakConcepts.length > 0) {
        perfBlock += `\n\nWEAK CONCEPTS TO TARGET:\n`;
        perfBlock += weakConcepts.map((c: any) => `- "${c.concept_tag}" (mastery: ${Math.round(c.mastery * 100)}%)`).join('\n');
        perfBlock += '\n  → If relevant to this topic, prioritise questions that probe these specific concepts.';
      }

      const basePrompt = `You are QUIZ_GENERATOR, an expert educational assessment writer.

GOAL: Generate 5 quiz questions that develop and diagnose the student's understanding of this topic through retrieval practice.

SUBJECT: ${subject?.subject_name || 'General'}${subject?.target_grade ? `\nTARGET GRADE: ${subject.target_grade}` : ''}${subject?.exam_date ? `\nEXAM DATE: ${subject.exam_date} — calibrate difficulty to reflect exam readiness, not just introductory recall` : ''}
TOPIC: ${topic.topic_name}${topic.weight && topic.weight > 1 ? ` [weight: ${topic.weight} — relatively high importance]` : ''}${topic.description ? `\nDESCRIPTION: ${topic.description}` : ''}${topic.goal ? `\nLEARNING GOAL: ${topic.goal}` : ''}${contextBlock ? `\n\nSTUDY MATERIAL:\n${contextBlock}` : ''}${perfBlock}

TASK: Generate exactly 5 multiple-choice questions.
${contextBlock ? 'Derive questions ONLY from the study material above — do not introduce facts not present in it.' : 'Use accurate, curriculum-relevant knowledge for this topic.'}

RULES:
1. Output JSON only — no markdown, no extra text.
2. Each question must have exactly 4 answer options; exactly one correct.
3. Wrong options must represent plausible misconceptions students commonly hold — not arbitrary wrong answers.
4. The correct answer must be unambiguous and defensible; avoid trick wording.
5. Include at least one diagnostic question that distinguishes two commonly confused concepts.
6. Prioritise application and analysis over rote recall.
7. Cover different aspects of the topic — do not repeat the same concept twice.
8. Assign 2–4 concept_tags per question: specific, lowercase concept strings (e.g. "time complexity", "linked list traversal").

Return ONLY a raw JSON array of exactly 5 objects with these fields:
- "question_text": string
- "options": array of exactly 4 strings
- "correct_answer": string (must exactly match one of the options)
- "difficulty": integer 1–5 (1 = basic recall, 5 = deep analysis)
- "concept_tags": array of 2–4 lowercase concept strings

No markdown fences, no explanation, no extra keys.`;

      let generated: any[] | null = null;
      let lastWasParseError = false;
      let lastError: unknown = null;

      for (let attempt = 1; attempt <= MAX_GEN_RETRIES; attempt++) {
        const contents = attempt > 1 && lastWasParseError
          ? basePrompt + '\n\nIMPORTANT: Output ONLY a raw JSON array. No markdown fences, no text before or after the array.'
          : basePrompt;

        try {
          const text = await generateText(contents, { model: MODEL });
          const raw = (text ?? '').trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '');
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) throw new SyntaxError('Response is not a JSON array');
          generated = parsed;
          break;
        } catch (err: unknown) {
          lastError = err;
          lastWasParseError = false;

          if (err instanceof SyntaxError) {
            // Bad JSON — retry immediately with a stricter instruction appended
            lastWasParseError = true;
          } else if (isRetryable(err)) {
            if (attempt < MAX_GEN_RETRIES) {
              await new Promise(resolve => setTimeout(resolve, backoffMs(attempt)));
            } else {
              return res.status(503).json({ error: 'rate_limited' });
            }
          } else {
            console.error('Non-retryable AI error:', err);
            break;
          }
        }
      }

      if (!generated) {
        console.error('Question generation failed after retries:', lastError);
        return res.status(500).json({ error: 'Failed to generate questions for this topic' });
      }

      // Insert using the same statement as POST /api/questions
      const insertQuestion = db.prepare(`
        INSERT INTO questions (topic_id, question_text, options, correct_answer, difficulty, concept_tags)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      db.transaction((qs: any[]) => {
        for (const q of qs.slice(0, 5)) {
          insertQuestion.run(
            topic_id,
            q.question_text,
            JSON.stringify(q.options),
            q.correct_answer,
            q.difficulty || 1,
            JSON.stringify(Array.isArray(q.concept_tags) ? q.concept_tags : [])
          );
        }
      })(generated);

      // Re-fetch so questions have their DB-assigned IDs
      questions = db.prepare(`
        SELECT id, question_text, options, difficulty
        FROM questions
        WHERE topic_id = ?
        ORDER BY RANDOM()
        LIMIT 5
      `).all(topic_id);
    }

    const parsedQuestions = questions.map((q: any) => ({
      question_id: q.id,
      question_text: q.question_text,
      options: JSON.parse(q.options),
      difficulty: q.difficulty
    }));

    res.json({
      quiz_id: Date.now().toString(),
      questions: parsedQuestions
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

// 6) Quiz Submission
// POST /api/quiz/submit
router.post('/submit', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { topic_id, answers } = req.body;

    if (!topic_id || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Invalid submission format' });
    }

    let correct_count = 0;
    const detailed_results: any[] = [];
    const total_questions = answers.length;
    const session_id = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);

    const insertAttempt = db.prepare(`
      INSERT INTO attempts (user_id, question_id, topic_id, selected_answer, correct, time_spent_seconds, difficulty, session_id, confidence_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const getQuestion = db.prepare('SELECT question_text, options, correct_answer, difficulty, concept_tags FROM questions WHERE id = ?');

    const transaction = db.transaction((answersList) => {
      for (const ans of answersList) {
        const question: any = getQuestion.get(ans.question_id);
        
        if (!question) continue;

        const isCorrect = question.correct_answer === ans.selected_answer;
        if (isCorrect) correct_count++;

        // Prepare detailed result
        detailed_results.push({
          question_id: ans.question_id,
          question_text: question.question_text,
          options: JSON.parse(question.options),
          selected_answer: ans.selected_answer,
          correct_answer: question.correct_answer,
          is_correct: isCorrect,
          difficulty: question.difficulty,
          concept_tags: question.concept_tags ? (JSON.parse(question.concept_tags) as string[]) : [],
        });

        insertAttempt.run(
          req.user!.id,
          ans.question_id,
          topic_id,
          ans.selected_answer,
          isCorrect ? 1 : 0,
          ans.time_spent_seconds,
          question.difficulty,
          session_id,
          ans.confidence_level ?? 'medium'
        );
      }
    });

    transaction(answers);

    // Build confidence lookup before the explanation loop (also used later for concept mastery)
    const confidenceByQId = new Map<number, string | null>();
    for (const ans of answers) {
      confidenceByQId.set(ans.question_id, ans.confidence_level ?? null);
    }

    // Fetch topic name once — enriches explanation context
    const topicRow: any = db.prepare('SELECT topic_name FROM topics WHERE id = ?').get(topic_id);
    const topicName: string = topicRow?.topic_name ?? '';

    // Generate AI explanations in parallel
    const resultsWithExplanations = await Promise.all(detailed_results.map(async (result) => {
      try {
        let explanation: string | null | undefined;

        // For correct answers, check the per-question cache first
        if (result.is_correct) {
          const cached = db.prepare('SELECT cached_explanation FROM questions WHERE id = ?').get(result.question_id) as any;
          if (cached?.cached_explanation) {
            db.prepare('UPDATE attempts SET ai_explanation = ? WHERE session_id = ? AND question_id = ?').run(
              cached.cached_explanation, session_id, result.question_id
            );
            return { ...result, explanation: cached.cached_explanation };
          }
        }

        const formattedOpts = (result.options as string[])
          .map((o: string, i: number) => `${String.fromCharCode(65 + i)}) ${o}`)
          .join(' | ');
        const tagsLine = result.concept_tags?.length
          ? `CONCEPTS TESTED: ${(result.concept_tags as string[]).join(', ')}`
          : '';
        const diffLine = `DIFFICULTY: ${result.difficulty}/5`;
        const confidence = confidenceByQId.get(result.question_id);

        const prompt = result.is_correct
          ? `You are an expert tutor writing a brief, illuminating explanation for a student reviewing their quiz results.

TOPIC: ${topicName}${tagsLine ? `\n${tagsLine}` : ''}
${diffLine}
QUESTION: ${result.question_text}
OPTIONS: ${formattedOpts}
CORRECT ANSWER: ${result.correct_answer}

Write 1–2 sentences explaining WHY "${result.correct_answer}" is correct. Identify the underlying principle or concept that makes it right. If the wrong options target common misconceptions, briefly state what distinguishes the correct answer. Use plain, precise language. Do not open with "The correct answer is..." or "This is correct because...".`
          : `You are an expert tutor writing a targeted, diagnostic explanation for a student who answered incorrectly.

TOPIC: ${topicName}${tagsLine ? `\n${tagsLine}` : ''}
${diffLine}
QUESTION: ${result.question_text}
OPTIONS: ${formattedOpts}
STUDENT'S ANSWER (WRONG): ${result.selected_answer}${confidence ? ` — declared with ${confidence} confidence` : ''}
CORRECT ANSWER: ${result.correct_answer}

Write 2–3 sentences that:
1. Name the specific misconception or reasoning error that leads to choosing "${result.selected_answer}".${confidence === 'high' ? ' This student was highly confident in their wrong answer — directly address the flawed mental model.' : ''}
2. Explain why "${result.correct_answer}" is correct in terms of the underlying principle.
Be diagnostic — help the student see exactly where their thinking went wrong, not just what the right answer is. Use plain, precise language.`;

        explanation = await generateText(prompt, { model: MODEL });

        // Cache correct-answer explanations on the question row for future sessions
        if (result.is_correct) {
          db.prepare('UPDATE questions SET cached_explanation = ? WHERE id = ?').run(
            explanation, result.question_id
          );
        }

        // Update the attempt with the explanation
        db.prepare('UPDATE attempts SET ai_explanation = ? WHERE session_id = ? AND question_id = ?').run(
          explanation,
          session_id,
          result.question_id
        );

        return {
          ...result,
          explanation
        };
      } catch (err) {
        console.error('AI generation failed for question:', result.question_id, err);
        return {
          ...result,
          explanation: "Explanation could not be generated."
        };
      }
    }));

    const score = total_questions > 0 ? Math.round((correct_count / total_questions) * 100) : 0;

    // Compute + persist BKT mastery per concept_tag (inspired by compute_mastery_scores in agent_orchestration)
    // Group this session's responses by concept_tag
    const conceptResponses = new Map<string, BKTResponse[]>();
    for (const result of detailed_results) {
      const qRow = db.prepare('SELECT concept_tags FROM questions WHERE id = ?').get(result.question_id) as any;
      const tags: string[] = qRow?.concept_tags ? (JSON.parse(qRow.concept_tags) as string[]) : [];
      for (const tag of tags) {
        if (!conceptResponses.has(tag)) conceptResponses.set(tag, []);
        conceptResponses.get(tag)!.push({
          correct: result.is_correct,
          confidence: confidenceByQId.get(result.question_id) ?? null,
        });
      }
    }

    // Upsert concept mastery, using stored mastery as BKT prior for continuity across sessions
    const getPriorMastery = db.prepare(
      'SELECT mastery, attempt_count FROM concept_mastery WHERE user_id = ? AND concept_tag = ?'
    );
    const upsertConceptMastery = db.prepare(`
      INSERT INTO concept_mastery (user_id, concept_tag, mastery, attempt_count, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, concept_tag) DO UPDATE SET
        mastery = excluded.mastery,
        attempt_count = attempt_count + excluded.attempt_count,
        updated_at = CURRENT_TIMESTAMP
    `);

    const conceptMasteryUpdates: Record<string, number> = {};
    for (const [tag, responses] of conceptResponses.entries()) {
      const prior = getPriorMastery.get(req.user!.id, tag) as any;
      const newMastery = computeBKTMastery(responses, prior?.mastery ?? undefined);
      upsertConceptMastery.run(req.user!.id, tag, newMastery, responses.length);
      conceptMasteryUpdates[tag] = newMastery;
    }

    // Compute and cache topic-level BKT mastery directly on the topics row
    const allTopicAttempts: any[] = db.prepare(`
      SELECT correct, confidence_level FROM attempts
      WHERE user_id = ? AND topic_id = ? ORDER BY attempt_timestamp ASC
    `).all(req.user!.id, topic_id);
    if (allTopicAttempts.length > 0) {
      const topicBKT: BKTResponse[] = allTopicAttempts.map((a: any) => ({
        correct: a.correct === 1,
        confidence: a.confidence_level ?? null,
      }));
      db.prepare('UPDATE topics SET mastery_score = ? WHERE id = ?').run(
        computeBKTMastery(topicBKT), topic_id
      );
    }

    res.json({
      score,
      total_questions,
      correct_count,
      results: resultsWithExplanations,
      conceptMasteryUpdates,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

// 7) Get Quiz History for a Topic
// GET /api/quiz/history/:topic_id
router.get('/history/:topic_id', authenticateToken, (req: AuthRequest, res) => {
  try {
    const { topic_id } = req.params;
    
    // Group attempts by session_id
    const sessions = db.prepare(`
      SELECT 
        session_id, 
        MAX(attempt_timestamp) as timestamp,
        COUNT(*) as total_questions,
        SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) as correct_count
      FROM attempts
      WHERE topic_id = ? AND user_id = ? AND session_id IS NOT NULL
      GROUP BY session_id
      ORDER BY timestamp DESC
    `).all(topic_id, req.user!.id);

    const history = sessions.map((s: any) => ({
      session_id: s.session_id,
      timestamp: s.timestamp,
      total_questions: s.total_questions,
      correct_count: s.correct_count,
      score: Math.round((s.correct_count / s.total_questions) * 100)
    }));

    res.json(history);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch quiz history' });
  }
});

// 8) Get Detailed Result for a Session
// GET /api/quiz/session/:session_id
router.get('/session/:session_id', authenticateToken, (req: AuthRequest, res) => {
  try {
    const { session_id } = req.params;

    const attempts = db.prepare(`
      SELECT a.*, q.question_text, q.options, q.correct_answer
      FROM attempts a
      JOIN questions q ON a.question_id = q.id
      WHERE a.session_id = ? AND a.user_id = ?
    `).all(session_id, req.user!.id);

    if (attempts.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const correct_count = attempts.filter((a: any) => a.correct === 1).length;
    const total_questions = attempts.length;
    const score = Math.round((correct_count / total_questions) * 100);

    const results = attempts.map((a: any) => ({
      question_id: a.question_id,
      question_text: a.question_text,
      options: JSON.parse(a.options),
      selected_answer: a.selected_answer,
      correct_answer: a.correct_answer,
      is_correct: a.correct === 1,
      explanation: a.ai_explanation || "Explanation not available."
    }));

    res.json({
      score,
      total_questions,
      correct_count,
      results
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch session details' });
  }
});

// Chat about a specific question
// POST /api/quiz/chat
router.post('/chat', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const {
      question_id,
      question_text,
      options,
      correct_answer,
      selected_answer,
      is_correct,
      explanation,
      chat_history,
      user_message
    } = req.body;

    if (!question_text || !user_message) {
      return res.status(400).json({ error: 'question_text and user_message are required' });
    }

    // Fetch question metadata from DB for richer context
    let chatTopicName = '';
    let chatConceptTags: string[] = [];
    let chatDifficulty: number | null = null;
    let chatMasteryPct: number | null = null;
    if (question_id) {
      const qMeta: any = db.prepare(`
        SELECT q.concept_tags, q.difficulty, t.id as topic_id, t.topic_name
        FROM questions q JOIN topics t ON q.topic_id = t.id WHERE q.id = ?
      `).get(question_id);
      if (qMeta) {
        chatTopicName = qMeta.topic_name ?? '';
        chatConceptTags = qMeta.concept_tags ? (JSON.parse(qMeta.concept_tags) as string[]) : [];
        chatDifficulty = qMeta.difficulty ?? null;
        // Student's BKT mastery for this topic
        const topicAttempts: any[] = db.prepare(`
          SELECT correct, confidence_level FROM attempts
          WHERE user_id = ? AND topic_id = ? ORDER BY attempt_timestamp ASC
        `).all(req.user!.id, qMeta.topic_id);
        if (topicAttempts.length > 0) {
          const bktResponses: BKTResponse[] = topicAttempts.map((a: any) => ({
            correct: a.correct === 1, confidence: a.confidence_level ?? null,
          }));
          chatMasteryPct = Math.round(computeBKTMastery(bktResponses) * 100);
        }
      }
    }

    const formattedOptions = (options as string[])
      .map((opt: string, i: number) => `${String.fromCharCode(65 + i)}) ${opt}`)
      .join('\n');

    const formattedHistory = (chat_history as { role: string; content: string }[])
      .map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
      .join('\n\n');

    const prompt = `You are QUESTION_TUTOR, an expert tutor specialising in helping students deeply understand individual exam questions.

GOAL: Answer the student's follow-up question about this specific quiz question. Your response should deepen their understanding of the underlying concept, not just confirm the answer.

---
${chatTopicName ? `TOPIC: ${chatTopicName}` : ''}${chatConceptTags.length ? `\nCONCEPTS TESTED: ${chatConceptTags.join(', ')}` : ''}${chatDifficulty ? `\nDIFFICULTY: ${chatDifficulty}/5` : ''}${chatMasteryPct !== null ? `\nSTUDENT'S TOPIC MASTERY: ${chatMasteryPct}% — calibrate explanation depth accordingly` : ''}
QUESTION: ${question_text}
OPTIONS:
${formattedOptions}
CORRECT ANSWER: ${correct_answer}
STUDENT'S ANSWER: ${selected_answer} (${is_correct ? 'Correct ✓' : 'Incorrect ✗'})
EXPLANATION ALREADY SHOWN:
${explanation || 'None provided.'}
---
${formattedHistory ? `CONVERSATION SO FAR:\n${formattedHistory}\n---\n` : ''}
STUDENT'S MESSAGE: ${user_message}

RULES:
1. Stay strictly on this question — do not discuss unrelated topics.
2. Do not repeat the explanation already shown unless explicitly asked.
3. If the student is confused, identify the specific conceptual gap and address it with a concrete example.
4. If the student got it wrong, probe their reasoning — ask what led them to that choice if it helps clarify the misconception.
5. Keep responses concise and targeted. Use plain language.
6. If the student demonstrates understanding, confirm it and optionally suggest a related concept to explore next.`;

    const reply = await generateText(prompt, { model: MODEL });
    res.json({ reply });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to generate reply' });
  }
});

export default router;

import { Router } from 'express';
import db from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import crypto from 'crypto';
import { generateText } from '../lib/ai';

const router = Router();

// Get aggregated report data
router.get('/data', authenticateToken, (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const subjectId = req.query.subject_id ? parseInt(req.query.subject_id as string) : null;

    // 1. Overall Subject Performance (Average Score per Subject)
    const subjectPerformance = subjectId
      ? db.prepare(`
          SELECT
            s.id as subject_id,
            s.subject_name,
            AVG(CASE WHEN a.correct = 1 THEN 100 ELSE 0 END) as average_score,
            COUNT(a.id) as total_attempts
          FROM subjects s
          LEFT JOIN topics t ON s.id = t.subject_id
          LEFT JOIN attempts a ON t.id = a.topic_id AND a.user_id = ?
          WHERE s.user_id = ? AND s.id = ?
          GROUP BY s.id
          HAVING total_attempts > 0
        `).all(userId, userId, subjectId)
      : db.prepare(`
          SELECT
            s.id as subject_id,
            s.subject_name,
            AVG(CASE WHEN a.correct = 1 THEN 100 ELSE 0 END) as average_score,
            COUNT(a.id) as total_attempts
          FROM subjects s
          LEFT JOIN topics t ON s.id = t.subject_id
          LEFT JOIN attempts a ON t.id = a.topic_id AND a.user_id = ?
          WHERE s.user_id = ?
          GROUP BY s.id
          HAVING total_attempts > 0
        `).all(userId, userId);

    // 2. Quiz Score Trend (Last 10 Sessions)
    const quizTrend = subjectId
      ? db.prepare(`
          SELECT
            a.session_id,
            MAX(a.attempt_timestamp) as date,
            AVG(CASE WHEN a.correct = 1 THEN 100 ELSE 0 END) as score
          FROM attempts a
          JOIN topics t ON a.topic_id = t.id
          WHERE a.user_id = ? AND a.session_id IS NOT NULL AND t.subject_id = ?
          GROUP BY a.session_id
          ORDER BY date ASC
          LIMIT 10
        `).all(userId, subjectId)
      : db.prepare(`
          SELECT
            session_id,
            MAX(attempt_timestamp) as date,
            AVG(CASE WHEN correct = 1 THEN 100 ELSE 0 END) as score
          FROM attempts
          WHERE user_id = ? AND session_id IS NOT NULL
          GROUP BY session_id
          ORDER BY date ASC
          LIMIT 10
        `).all(userId);

    // 3. Topic Mastery (Weakest Topics)
    const weakTopics = subjectId
      ? db.prepare(`
          SELECT
            t.topic_name,
            s.subject_name,
            AVG(CASE WHEN a.correct = 1 THEN 100 ELSE 0 END) as mastery_score
          FROM topics t
          JOIN subjects s ON t.subject_id = s.id
          JOIN attempts a ON t.id = a.topic_id
          WHERE s.user_id = ? AND s.id = ?
          GROUP BY t.id
          ORDER BY mastery_score ASC
          LIMIT 5
        `).all(userId, subjectId)
      : db.prepare(`
          SELECT
            t.topic_name,
            s.subject_name,
            AVG(CASE WHEN a.correct = 1 THEN 100 ELSE 0 END) as mastery_score
          FROM topics t
          JOIN subjects s ON t.subject_id = s.id
          JOIN attempts a ON t.id = a.topic_id
          WHERE s.user_id = ?
          GROUP BY t.id
          ORDER BY mastery_score ASC
          LIMIT 5
        `).all(userId);

    // 4. Confidence Calibration (accuracy rate per declared confidence level)
    const confidenceCalibration = subjectId
      ? db.prepare(`
          SELECT
            a.confidence_level,
            COUNT(*) as total,
            SUM(CASE WHEN a.correct = 1 THEN 1 ELSE 0 END) as correct_count,
            ROUND(AVG(CASE WHEN a.correct = 1 THEN 100.0 ELSE 0 END), 1) as accuracy
          FROM attempts a
          JOIN topics t ON a.topic_id = t.id
          WHERE a.user_id = ? AND a.confidence_level IS NOT NULL AND t.subject_id = ?
          GROUP BY a.confidence_level
          ORDER BY CASE a.confidence_level WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 END
        `).all(userId, subjectId)
      : db.prepare(`
          SELECT
            confidence_level,
            COUNT(*) as total,
            SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) as correct_count,
            ROUND(AVG(CASE WHEN correct = 1 THEN 100.0 ELSE 0 END), 1) as accuracy
          FROM attempts
          WHERE user_id = ? AND confidence_level IS NOT NULL
          GROUP BY confidence_level
          ORDER BY CASE confidence_level WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 END
        `).all(userId);

    // 5. Recent Activity
    const recentActivity = subjectId
      ? db.prepare(`
          SELECT
            COUNT(*) as total_questions_answered,
            SUM(CASE WHEN a.correct = 1 THEN 1 ELSE 0 END) as correct_answers,
            SUM(a.time_spent_seconds) as total_time_spent
          FROM attempts a
          JOIN topics t ON a.topic_id = t.id
          WHERE a.user_id = ? AND a.attempt_timestamp >= date('now', '-7 days') AND t.subject_id = ?
        `).get(userId, subjectId)
      : db.prepare(`
          SELECT
            COUNT(*) as total_questions_answered,
            SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) as correct_answers,
            SUM(time_spent_seconds) as total_time_spent
          FROM attempts
          WHERE user_id = ? AND attempt_timestamp >= date('now', '-7 days')
        `).get(userId);

    // 6. Per-topic BKT mastery — read cached mastery_score from topics table (updated after each quiz)
    const topicMastery: { topic_id: number; topic_name: string; mastery: number; attempt_count: number }[] = [];
    if (subjectId) {
      const topicRows: any[] = db.prepare(`
        SELECT t.id as topic_id, t.topic_name, t.mastery_score,
               COUNT(a.id) as attempt_count
        FROM topics t
        LEFT JOIN attempts a ON a.topic_id = t.id AND a.user_id = ?
        WHERE t.subject_id = ?
        GROUP BY t.id
        HAVING attempt_count > 0 AND t.mastery_score IS NOT NULL
      `).all(userId, subjectId);

      for (const row of topicRows) {
        topicMastery.push({
          topic_id: row.topic_id,
          topic_name: row.topic_name,
          mastery: row.mastery_score,
          attempt_count: row.attempt_count,
        });
      }
      topicMastery.sort((a, b) => a.mastery - b.mastery); // weakest first
    }

    // 7. Concept-level BKT mastery (global for user — cross-topic signal for AI Insights)
    const conceptMastery: any[] = db.prepare(`
      SELECT concept_tag, mastery, attempt_count
      FROM concept_mastery
      WHERE user_id = ?
      ORDER BY mastery ASC
    `).all(userId);

    // 8. Mistake clusters by concept_tag (for bubble chart)
    const wrongAttempts: { concept_tags: string | null }[] = subjectId
      ? db.prepare(`
          SELECT q.concept_tags
          FROM attempts a
          JOIN topics t ON a.topic_id = t.id
          JOIN questions q ON a.question_id = q.id
          WHERE a.user_id = ? AND a.correct = 0 AND t.subject_id = ?
        `).all(userId, subjectId)
      : db.prepare(`
          SELECT q.concept_tags
          FROM attempts a
          JOIN questions q ON a.question_id = q.id
          WHERE a.user_id = ? AND a.correct = 0
        `).all(userId);

    const wrongByConcept = new Map<string, number>();
    for (const row of wrongAttempts) {
      const tags: string[] = row.concept_tags ? (JSON.parse(row.concept_tags) as string[]) : [];
      for (const tag of tags) {
        wrongByConcept.set(tag, (wrongByConcept.get(tag) || 0) + 1);
      }
    }
    const conceptMasteryMap = new Map(conceptMastery.map(c => [c.concept_tag, c]));
    const mistakesByConcept = Array.from(wrongByConcept.entries())
      .map(([concept_tag, wrong_count]) => {
        const c = conceptMasteryMap.get(concept_tag);
        return {
          concept_tag,
          wrong_count,
          attempt_count: c?.attempt_count ?? wrong_count,
          mastery: c?.mastery ?? 0.4,
        };
      })
      .sort((a, b) => b.wrong_count - a.wrong_count)
      .slice(0, 20);

    // 9. Exam readiness score (weighted by topic importance + mastery)
    let examReadinessScore: number | null = null;
    if (subjectId) {
      const topicRows: { mastery_score: number | null; weight: number | null }[] = db.prepare(`
        SELECT mastery_score, weight FROM topics
        WHERE subject_id = ?
      `).all(subjectId);
      const totalWeight = topicRows.reduce((s, r) => s + (r.weight ?? 1), 0);
      if (totalWeight > 0) {
        const weighted = topicRows.reduce((s, r) => {
          const mastery = r.mastery_score ?? 0;
          const w = r.weight ?? 1;
          return s + mastery * w;
        }, 0);
        examReadinessScore = Math.round((weighted / totalWeight) * 100);
      }
    }

    // 10. Study ROI (accuracy improvement per hour over last 14 days)
    const periodA = subjectId
      ? db.prepare(`
          SELECT COUNT(*) as total, SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) as correct,
                 SUM(time_spent_seconds) as time_spent
          FROM attempts a
          JOIN topics t ON a.topic_id = t.id
          WHERE a.user_id = ? AND t.subject_id = ? AND a.attempt_timestamp >= date('now', '-14 days')
        `).get(userId, subjectId)
      : db.prepare(`
          SELECT COUNT(*) as total, SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) as correct,
                 SUM(time_spent_seconds) as time_spent
          FROM attempts
          WHERE user_id = ? AND attempt_timestamp >= date('now', '-14 days')
        `).get(userId);

    const periodB = subjectId
      ? db.prepare(`
          SELECT COUNT(*) as total, SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) as correct
          FROM attempts a
          JOIN topics t ON a.topic_id = t.id
          WHERE a.user_id = ? AND t.subject_id = ? AND a.attempt_timestamp < date('now', '-14 days')
            AND a.attempt_timestamp >= date('now', '-28 days')
        `).get(userId, subjectId)
      : db.prepare(`
          SELECT COUNT(*) as total, SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) as correct
          FROM attempts
          WHERE user_id = ? AND attempt_timestamp < date('now', '-14 days')
            AND attempt_timestamp >= date('now', '-28 days')
        `).get(userId);

    const accA = periodA?.total ? (periodA.correct / periodA.total) * 100 : null;
    const accB = periodB?.total ? (periodB.correct / periodB.total) * 100 : null;
    const deltaAcc = accA !== null && accB !== null ? accA - accB : (accA ?? null);
    const hoursA = (periodA?.time_spent ?? 0) / 3600;
    const studyRoi = deltaAcc !== null && hoursA > 0
      ? Math.round((deltaAcc / hoursA) * 10) / 10
      : null;

    res.json({
      subjectPerformance,
      quizTrend,
      weakTopics,
      recentActivity,
      confidenceCalibration,
      topicMastery,
      conceptMastery,
      mistakesByConcept,
      examReadinessScore,
      studyRoi,
    });
  } catch (error) {
    console.error('Report data error:', error);
    res.status(500).json({ error: 'Failed to fetch report data' });
  }
});

// Generate AI Insights
router.post('/generate-insights', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { reportData, subject_id } = req.body;

    if (!reportData) {
      return res.status(400).json({ error: 'Report data is required' });
    }

    const userId = req.user!.id;

    // Fetch subject and student context server-side for richer prompt
    const subject: any = subject_id
      ? db.prepare('SELECT subject_name, exam_date, target_grade FROM subjects WHERE id = ? AND user_id = ?').get(subject_id, userId)
      : null;
    const student: any = db.prepare('SELECT preferred_study_time_per_day, target_grade FROM users WHERE id = ?').get(userId);
    const dataHash = crypto.createHash('md5').update(JSON.stringify(reportData)).digest('hex');

    // Return cached insights if the data hasn't changed
    const cached = db.prepare(
      'SELECT insights FROM report_insights_cache WHERE user_id = ? AND data_hash = ?'
    ).get(userId, dataHash) as any;

    if (cached) {
      return res.json({ insights: cached.insights });
    }

    // Format data into a readable structure for the prompt rather than raw JSON
    const rd = reportData;
    const topicMasteryBlock = rd.topicMastery?.length
      ? rd.topicMastery.map((t: any) => `  - ${t.topic_name}: ${Math.round(t.mastery * 100)}% BKT mastery (${t.attempt_count} attempts)`).join('\n')
      : '  No topic attempt data yet.';
    const conceptBlock = rd.conceptMastery?.length
      ? rd.conceptMastery.map((c: any) => `  - "${c.concept_tag}": ${Math.round(c.mastery * 100)}% (${c.attempt_count} attempts)`).join('\n')
      : '  No concept-level data yet.';
    const calibBlock = rd.confidenceCalibration?.length
      ? rd.confidenceCalibration.map((c: any) => `  - ${c.confidence_level} confidence: ${Math.round(c.accuracy)}% accuracy (${c.total} questions)`).join('\n')
      : '  No confidence data yet.';
    const trendBlock = rd.quizTrend?.length
      ? rd.quizTrend.map((s: any) => `  ${new Date(s.date).toLocaleDateString()}: ${Math.round(s.score)}%`).join('\n')
      : '  No session history yet.';
    const activity = rd.recentActivity;

    const prompt = `You are LEARNING_ANALYST, an expert educational data analyst and academic coach.

ROLE: Analyse this student's performance data and produce a structured, actionable learning report. Every claim must be grounded in the data — avoid generic statements that could apply to any student.

STUDENT CONTEXT:${subject ? `\n- Subject: ${subject.subject_name}` : ''}${subject?.target_grade ? `\n- Target grade: ${subject.target_grade}` : (student?.target_grade ? `\n- Target grade: ${student.target_grade}` : '')}${subject?.exam_date ? `\n- Exam date: ${subject.exam_date}` : ''}${student?.preferred_study_time_per_day ? `\n- Daily study goal: ${student.preferred_study_time_per_day} minutes` : ''}

PERFORMANCE DATA:
Recent Activity (last 7 days):
  - Questions answered: ${activity?.total_questions_answered ?? 0}
  - Correct answers: ${activity?.correct_answers ?? 0}
  - Time spent: ${Math.round((activity?.total_time_spent ?? 0) / 60)} minutes

Topic Mastery (BKT estimates, weakest first):
${topicMasteryBlock}

Concept Mastery (BKT estimates, weakest first):
${conceptBlock}

Confidence Calibration:
${calibBlock}

Quiz Score Trend (chronological):
${trendBlock}

REPORT STRUCTURE — use these exact Markdown headings:

## Executive Summary
2–3 sentences. State the student's current standing using specific numbers from the data. Identify the single most important thing to act on right now.

## Strengths
Bullet points. Identify topics or concepts where mastery ≥ 70%. Reference specific names from the data. Skip if none qualify.

## Priority Focus Areas
Bullet points ordered by severity. For each weak topic or concept (mastery < 50%): state the mastery percentage and describe the likely knowledge gap. Skip if none qualify.

## Action Plan (Next 7 Days)
3–5 specific, time-bounded actions. Reference topic/concept names. Estimate time per session${student?.preferred_study_time_per_day ? ` (student's daily goal is ${student.preferred_study_time_per_day} min — keep total within this)` : ''}. Base on weak concepts, calibration gaps, and study time patterns.${subject?.exam_date ? ` Exam is on ${subject.exam_date} — reflect that urgency in prioritisation.` : ''}

## Confidence Calibration Note
Only include if calibration data is present. Flag overconfidence (high-confidence accuracy < 70%) or underestimated knowledge (low-confidence accuracy > 70%) with specific percentages.

## Closing
One sentence specific to this student's situation — reference their actual progress or a genuine strength.

RULES:
1. Every claim must cite a specific number from the data above.
2. Do not repeat the same advice across sections.
3. Omit any section entirely if data for it is missing — do not write placeholder text.
4. Tone: precise and direct like a rigorous academic advisor, not a cheerleader.`;

    const insights = await generateText(prompt);

    // Store in cache keyed by (user_id, data_hash)
    db.prepare(
      'INSERT OR REPLACE INTO report_insights_cache (user_id, data_hash, insights, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
    ).run(userId, dataHash, insights);

    res.json({ insights });
  } catch (error) {
    console.error('AI insights error:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

export default router;

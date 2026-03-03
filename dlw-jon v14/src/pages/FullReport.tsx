import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart2, TrendingUp, Activity, Brain, Target, Flame } from 'lucide-react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import ReactMarkdown from 'react-markdown';

type HintColor = 'amber' | 'emerald' | 'indigo';
interface Hint { color: HintColor; text: string; }

const HINT_STYLE: Record<HintColor, string> = {
  amber:   'text-amber-400/80 bg-amber-500/8 border-amber-500/15',
  emerald: 'text-emerald-400/80 bg-emerald-500/8 border-emerald-500/15',
  indigo:  'text-indigo-300/80 bg-indigo-500/8 border-indigo-500/15',
};
const HINT_PREFIX: Record<HintColor, string> = {
  amber: '⚠',
  emerald: '✓',
  indigo: '💡',
};

function renderHint(hint: Hint | null) {
  if (!hint) return null;
  return (
    <p className={`text-xs border rounded-lg px-3 py-2 ${HINT_STYLE[hint.color]}`}>
      {HINT_PREFIX[hint.color]} {hint.text}
    </p>
  );
}

export default function FullReport() {
  const [reportData, setReportData] = useState<any>(null);
  const [insights, setInsights] = useState('');
  const [loading, setLoading] = useState(true);
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [allSubjects, setAllSubjects] = useState<{ id: number; subject_name: string }[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  const token = localStorage.getItem('token');

  const fetchReportData = async (subjectId: string) => {
    try {
      const res = await fetch(`/api/report/data?subject_id=${subjectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (error) {
      console.error('Failed to fetch report data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const res = await fetch('/api/subjects', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const subjects = await res.json();
          setAllSubjects(subjects);
          if (subjects.length > 0) {
            const firstId = String(subjects[0].id);
            setSelectedSubjectId(firstId);
            fetchReportData(firstId);
          } else {
            setLoading(false);
          }
        }
      } catch (error) {
        console.error('Failed to fetch subjects', error);
        setLoading(false);
      }
    };

    fetchSubjects();
  }, [token]);

  const handleSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedSubjectId(value);
    setLoading(true);
    setInsights('');
    fetchReportData(value);
  };

  const generateInsights = async (data: any) => {
    setGeneratingInsights(true);
    try {
      const res = await fetch('/api/report/generate-insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reportData: data, subject_id: selectedSubjectId })
      });
      if (res.ok) {
        const result = await res.json();
        setInsights(result.insights);
      }
    } catch (error) {
      console.error('Failed to generate insights', error);
    } finally {
      setGeneratingInsights(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-spinner" />
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="glass-surface p-8 text-center text-white/60">Failed to load report data.</div>
      </div>
    );
  }

  // ── Derived values ───────────────────────────────────────
  const activityCount: number = reportData.recentActivity?.total_questions_answered || 0;
  const correctCount: number  = reportData.recentActivity?.correct_answers || 0;
  const timeSeconds: number   = reportData.recentActivity?.total_time_spent || 0;
  const accuracy: number      = activityCount > 0 ? Math.round((correctCount / activityCount) * 100) : 0;
  const timeMinutes: number   = Math.round(timeSeconds / 60);
  const avgSecsPerQ: number   = activityCount > 0 ? timeSeconds / activityCount : 0;
  const trendData: any[]      = reportData.quizTrend || [];
  const examReadiness: number | null = reportData.examReadinessScore ?? null;
  const studyRoi: number | null = reportData.studyRoi ?? null;
  const mistakesByConcept: any[] = reportData.mistakesByConcept || [];

  // ── Contextual hints ─────────────────────────────────────

  const activityHint: Hint | null = (() => {
    if (activityCount === 0)
      return { color: 'amber', text: 'No activity in the past 7 days — try completing at least one quiz session to stay on track.' };
    if (activityCount < 10)
      return { color: 'indigo', text: `Only ${activityCount} question${activityCount === 1 ? '' : 's'} this week — aim for daily practice to strengthen long-term retention.` };
    if (activityCount >= 20)
      return { color: 'emerald', text: 'Strong activity this week — consistent practice is the foundation of long-term retention.' };
    return null;
  })();

  const accuracyHint: Hint | null = (() => {
    if (activityCount === 0) return null;
    if (trendData.length >= 6) {
      const mid = Math.floor(trendData.length / 2);
      const earlyAvg = trendData.slice(0, mid).reduce((s: number, r: any) => s + r.score, 0) / mid;
      const recentAvg = trendData.slice(-mid).reduce((s: number, r: any) => s + r.score, 0) / mid;
      const diff = recentAvg - earlyAvg;
      if (diff > 10)
        return { color: 'emerald', text: `Up ${Math.round(diff)} points from your earlier sessions — your accuracy is trending in the right direction.` };
      if (diff < -10)
        return { color: 'amber', text: `Down ${Math.round(Math.abs(diff))} points from your earlier sessions — consider revisiting topics you found difficult.` };
    }
    if (accuracy < 50)
      return { color: 'amber', text: 'Below 50% accuracy — focus on understanding the material before re-attempting these quizzes.' };
    if (accuracy >= 85)
      return { color: 'emerald', text: 'Excellent accuracy — consider challenging yourself with harder topics to keep growing.' };
    return null;
  })();

  const studyTimeHint: Hint | null = (() => {
    if (activityCount === 0 || timeSeconds === 0) return null;
    if (avgSecsPerQ < 8)
      return { color: 'amber', text: `Averaging only ${Math.round(avgSecsPerQ)}s per question — slow down and read each question carefully before answering.` };
    if (timeMinutes >= 60)
      return { color: 'emerald', text: `${timeMinutes} minutes of focused practice this week — your dedication is building strong knowledge foundations.` };
    if (timeMinutes < 10)
      return { color: 'indigo', text: 'Less than 10 minutes of study this week — even short daily sessions make a significant difference over time.' };
    return null;
  })();

  const trendHint: Hint | null = (() => {
    if (trendData.length < 3) return null;
    const mid = Math.floor(trendData.length / 2);
    const earlyAvg = trendData.slice(0, mid).reduce((s: number, r: any) => s + r.score, 0) / mid;
    const recentAvg = trendData.slice(-mid).reduce((s: number, r: any) => s + r.score, 0) / mid;
    const diff = recentAvg - earlyAvg;
    if (diff > 8)
      return { color: 'emerald', text: `Scores up ${Math.round(diff)} points from your first sessions — a clear upward trajectory.` };
    if (diff < -8)
      return { color: 'amber', text: `Scores down ${Math.round(Math.abs(diff))} points from your earlier sessions — review the topics from your recent quizzes.` };
    if (trendData.length >= 5 && Math.abs(diff) <= 5)
      return { color: 'indigo', text: 'Your scores have plateaued — try tackling new topics or increasing the difficulty to break through.' };
    return null;
  })();

  const calibrationHint: Hint | null = (() => {
    const high = reportData.confidenceCalibration?.find((r: any) => r.confidence_level === 'high');
    const low  = reportData.confidenceCalibration?.find((r: any) => r.confidence_level === 'low');
    if (high && high.accuracy < 60)
      return { color: 'amber', text: `Your "High" confidence answers are only ${Math.round(high.accuracy)}% accurate — you may be overestimating your knowledge in this subject.` };
    if (low && low.accuracy > 75)
      return { color: 'indigo', text: `Your "Low" confidence answers are ${Math.round(low.accuracy)}% accurate — you likely know more than you think!` };
    return null;
  })();

  const readinessHint: Hint | null = (() => {
    if (examReadiness === null) return null;
    if (examReadiness >= 75)
      return { color: 'emerald', text: `Readiness at ${examReadiness}% â€” youâ€™re on track. Maintain momentum with targeted practice.` };
    if (examReadiness < 50)
      return { color: 'amber', text: `Readiness at ${examReadiness}% â€” focus on weakest topics and schedule frequent review sessions.` };
    return { color: 'indigo', text: `Readiness at ${examReadiness}% â€” steady progress. Prioritise topics below 70% mastery.` };
  })();

  const roiHint: Hint | null = (() => {
    if (studyRoi === null) return null;
    if (studyRoi >= 6)
      return { color: 'emerald', text: `Strong ROI: +${studyRoi} accuracy points per hour. Your study time is paying off.` };
    if (studyRoi <= 0)
      return { color: 'amber', text: `ROI is ${studyRoi}. Consider changing study strategy or revisiting fundamentals.` };
    return { color: 'indigo', text: `ROI is +${studyRoi} points per hour â€” small gains. Increase focus on weak concepts.` };
  })();

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Back link */}
      <Link to="/dashboard" className="glass-back-link inline-flex mb-8">
        <ArrowLeft size={18} /> Back to Dashboard
      </Link>

      <div className="space-y-10">

        {/* ── Page Header ───────────────────────────────────────── */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/8">
          <div>
            <h1 className="text-3xl font-bold text-white/95 tracking-tight">Learning Report</h1>
            <p className="text-sm text-white/45 mt-1">Detailed analytics and AI-driven insights</p>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="subject-filter" className="text-sm font-medium text-white/50 whitespace-nowrap">
              Subject
            </label>
            <select
              id="subject-filter"
              value={selectedSubjectId}
              onChange={handleSubjectChange}
              className="glass-input"
              style={{ minWidth: '180px' }}
            >
              {allSubjects.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.subject_name}
                </option>
              ))}
            </select>
          </div>
        </header>

        {/* ── Section: Key Metrics ──────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-white/35 uppercase tracking-widest">This Week</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Recent Activity */}
            <div className="glass-surface p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-5">
                <div className="glass-icon-box">
                  <Activity size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">Recent Activity</p>
                  <p className="text-[11px] text-white/30 mt-0.5">Last 7 days</p>
                </div>
              </div>
              <p className="text-4xl font-bold text-white/95 tabular-nums leading-none">{activityCount}</p>
              <p className="text-xs text-white/40 mt-2">Questions answered</p>
              <div className="mt-auto pt-4">{renderHint(activityHint)}</div>
            </div>

            {/* Accuracy Rate */}
            <div className="glass-surface p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-5">
                <div className="glass-icon-box-green">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">Accuracy Rate</p>
                  <p className="text-[11px] text-white/30 mt-0.5">{correctCount} of {activityCount} correct</p>
                </div>
              </div>
              <p className="text-4xl font-bold text-white/95 tabular-nums leading-none">{accuracy}%</p>
              <p className="text-xs text-white/40 mt-2">Correct answers</p>
              <div className="mt-auto pt-4">{renderHint(accuracyHint)}</div>
            </div>

            {/* Study Time */}
            <div className="glass-surface p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-5">
                <div className="glass-icon-box-violet">
                  <Brain size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">Study Time</p>
                  <p className="text-[11px] text-white/30 mt-0.5">
                    {avgSecsPerQ > 0 ? `Avg ${Math.round(avgSecsPerQ)}s per question` : 'No data yet'}
                  </p>
                </div>
              </div>
              <p className="text-4xl font-bold text-white/95 tabular-nums leading-none">{timeMinutes}</p>
              <p className="text-xs text-white/40 mt-2">Minutes spent</p>
              <div className="mt-auto pt-4">{renderHint(studyTimeHint)}</div>
            </div>

          </div>
        </section>

        {/* â”€â”€ Section: Decision Support â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}        
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-white/35 uppercase tracking-widest">Decision Support</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Exam Readiness */}
            <div className="glass-surface p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-5">
                <div className="glass-icon-box-violet">
                  <Target size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">Exam Readiness</p>
                  <p className="text-[11px] text-white/30 mt-0.5">Weighted by topic mastery & importance</p>
                </div>
              </div>
              <p className="text-4xl font-bold text-white/95 tabular-nums leading-none">
                {examReadiness === null ? 'â€”' : `${examReadiness}%`}
              </p>
              <p className="text-xs text-white/40 mt-2">Overall readiness score</p>
              <div className="mt-auto pt-4">{renderHint(readinessHint)}</div>
            </div>

            {/* Study ROI */}
            <div className="glass-surface p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-5">
                <div className="glass-icon-box-green">
                  <Flame size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">Study ROI</p>
                  <p className="text-[11px] text-white/30 mt-0.5">Accuracy gain per hour (last 14 days)</p>
                </div>
              </div>
              <p className="text-4xl font-bold text-white/95 tabular-nums leading-none">
                {studyRoi === null ? 'â€”' : `${studyRoi}`}
              </p>
              <p className="text-xs text-white/40 mt-2">Points per hour</p>
              <div className="mt-auto pt-4">{renderHint(roiHint)}</div>
            </div>
          </div>
        </section>

        {/* ── Section: Topic Mastery ────────────────────────────── */}
        {reportData.topicMastery?.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xs font-semibold text-white/35 uppercase tracking-widest">Topic Mastery</h2>
            <div className="glass-surface p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="glass-icon-box">
                  <BarChart2 size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white/90">BKT Mastery by Topic</h3>
                  <p className="text-xs text-white/38 mt-0.5">Probabilistic mastery estimated from your full attempt history</p>
                </div>
              </div>
              <div className="space-y-5">
                {reportData.topicMastery.map((t: any) => {
                  const pct = Math.round(t.mastery * 100);
                  const tier =
                    t.mastery < 0.50
                      ? { bar: 'rgba(245,158,11,0.70)', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', text: '#fcd34d', label: 'Needs work' }
                      : t.mastery < 0.70
                      ? { bar: 'rgba(99,102,241,0.70)',  bg: 'rgba(99,102,241,0.10)',  border: 'rgba(99,102,241,0.25)',  text: '#a5b4fc', label: 'Progressing' }
                      : { bar: 'rgba(52,211,153,0.70)',  bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.25)',  text: '#6ee7b7', label: 'Mastered' };
                  return (
                    <div key={t.topic_id}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-white/80 font-medium">{t.topic_name}</span>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full border font-semibold"
                            style={{ background: tier.bg, borderColor: tier.border, color: tier.text }}
                          >
                            {tier.label}
                          </span>
                          <span className="text-sm font-bold tabular-nums" style={{ color: tier.text }}>{pct}%</span>
                          <span className="text-[10px] text-white/30">({t.attempt_count} attempts)</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: tier.bar }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── Section: Analytics Charts ─────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-white/35 uppercase tracking-widest">Analytics</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Confidence Calibration */}
            <div className="glass-surface p-6 flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-bold text-white/90 flex items-center gap-2">
                  <BarChart2 size={16} className="text-indigo-400" /> Confidence Calibration
                </h3>
                <p className="text-xs text-white/38 mt-1.5">
                  Accuracy rate at each self-declared confidence level
                </p>
              </div>

              {!reportData.confidenceCalibration?.length ? (
                <div className="flex-1 flex items-center justify-center min-h-[220px]">
                  <p className="text-sm text-white/30 text-center max-w-[240px]">
                    No confidence data yet — attempt some quizzes to see your calibration.
                  </p>
                </div>
              ) : (
                <>
                  {/* Summary pills */}
                  <div className="flex gap-2 flex-wrap">
                    {reportData.confidenceCalibration.map((row: any) => {
                      const color =
                        row.confidence_level === 'low'    ? { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', text: '#fcd34d' } :
                        row.confidence_level === 'medium' ? { bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.25)', text: '#a5b4fc' } :
                                                            { bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.25)', text: '#6ee7b7' };
                      return (
                        <div
                          key={row.confidence_level}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs"
                          style={{ background: color.bg, borderColor: color.border, color: color.text }}
                        >
                          <span className="capitalize font-semibold">{row.confidence_level}</span>
                          <span className="opacity-50">·</span>
                          <span>{Math.round(row.accuracy)}%</span>
                          <span className="opacity-40 text-[10px]">({row.total}q)</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bar chart */}
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={reportData.confidenceCalibration}
                        barCategoryGap="32%"
                        margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="confidence_level"
                          tickFormatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                        />
                        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                          formatter={(value: any, _name: any, props: any) => [
                            `${Math.round(value)}%  (${props.payload.correct_count}/${props.payload.total} correct)`,
                            'Accuracy',
                          ]}
                          labelFormatter={(label) => `${label.charAt(0).toUpperCase() + label.slice(1)} confidence`}
                        />
                        <ReferenceLine y={50} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                        <Bar dataKey="accuracy" radius={[6, 6, 0, 0]} name="Accuracy (%)">
                          {reportData.confidenceCalibration.map((row: any) => (
                            <Cell
                              key={row.confidence_level}
                              fill={
                                row.confidence_level === 'low'    ? 'rgba(245,158,11,0.65)' :
                                row.confidence_level === 'medium' ? 'rgba(99,102,241,0.65)' :
                                                                    'rgba(52,211,153,0.65)'
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-auto">{renderHint(calibrationHint)}</div>
                </>
              )}
            </div>

            {/* Progress Over Time */}
            <div className="glass-surface p-6 flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-bold text-white/90 flex items-center gap-2">
                  <TrendingUp size={16} className="text-emerald-400" /> Progress Over Time
                </h3>
                <p className="text-xs text-white/38 mt-1.5">
                  Quiz scores across your last {trendData.length > 0 ? trendData.length : ''} sessions
                </p>
              </div>

              {trendData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center min-h-[220px]">
                  <p className="text-sm text-white/30 text-center max-w-[240px]">
                    No sessions yet — complete some quizzes to see your trend.
                  </p>
                </div>
              ) : (
                <>
                  {/* Spacer matches the summary pills row height for visual chart alignment */}
                  <div className="h-[30px]" aria-hidden="true" />

                  {/* Line chart */}
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(tick) => new Date(tick).toLocaleDateString()}
                        />
                        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                          labelFormatter={(label) => new Date(label).toLocaleString()}
                          formatter={(v: any) => [`${Math.round(v)}%`, 'Score']}
                        />
                        <Line
                          type="monotone"
                          dataKey="score"
                          stroke="#34d399"
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: '#34d399', strokeWidth: 0 }}
                          name="Score (%)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-auto">{renderHint(trendHint)}</div>
                </>
              )}
            </div>

          </div>

          {/* Mistake Clusters */}
          <div className="glass-surface p-6 mt-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="glass-icon-box">
                <BarChart2 size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white/90">Mistake Clusters</h3>
                <p className="text-xs text-white/38 mt-0.5">
                  Bubble size = attempts, Y = wrong count, X = mastery %. Larger & higher bubbles indicate risk areas.
                </p>
              </div>
            </div>

            {mistakesByConcept.length === 0 ? (
              <div className="flex items-center justify-center min-h-[240px]">
                <p className="text-sm text-white/30 text-center max-w-[320px]">
                  No mistake data yet â€” complete more quizzes to see clusters by concept.
                </p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="mastery"
                      domain={[0, 1]}
                      tickFormatter={(v) => `${Math.round(v * 100)}%`}
                      name="Mastery"
                    />
                    <YAxis type="number" dataKey="wrong_count" name="Wrong Count" />
                    <ZAxis type="number" dataKey="attempt_count" range={[60, 220]} />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      formatter={(value: any, name: any, props: any) => {
                        if (name === 'mastery') return [`${Math.round(value * 100)}%`, 'Mastery'];
                        if (name === 'wrong_count') return [value, 'Wrong answers'];
                        if (name === 'attempt_count') return [value, 'Attempts'];
                        return [value, name];
                      }}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.concept_tag || 'Concept'}
                    />
                    <Scatter data={mistakesByConcept} fill="rgba(245,158,11,0.75)" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        {/* ── Section: AI Insights ──────────────────────────────── */}
        <section>
          <div className="glass-surface p-8">
            <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="glass-icon-box-violet flex-shrink-0">
                  <Brain size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white/95 leading-tight">AI Learning Analysis</h2>
                  <p className="text-xs text-white/40 mt-0.5">Personalised insights from your performance data</p>
                </div>
              </div>
              <button
                onClick={() => generateInsights(reportData)}
                disabled={generatingInsights}
                className="glass-btn glass-btn-primary"
              >
                <Brain size={15} />
                {generatingInsights ? 'Generating...' : insights ? 'Regenerate' : 'Generate Insights'}
              </button>
            </div>

            <div className="glass-prose">
              {generatingInsights ? (
                <div className="space-y-3 animate-pulse">
                  <div className="glass-skeleton h-4 w-3/4" />
                  <div className="glass-skeleton h-4 w-1/2" />
                  <div className="glass-skeleton h-4 w-5/6" />
                  <div className="glass-skeleton h-4 w-2/3" />
                </div>
              ) : insights ? (
                <ReactMarkdown>{insights}</ReactMarkdown>
              ) : (
                <p className="text-white/35 text-sm">
                  Click "Generate Insights" to get a personalised AI analysis of your performance.
                </p>
              )}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

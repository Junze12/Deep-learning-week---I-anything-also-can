import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowRight, Send } from 'lucide-react';

interface Question {
  question_id: number;
  question_text: string;
  options: string[];
  difficulty: number;
}

type ConfidenceLevel = 'low' | 'medium' | 'high';

interface Answer {
  question_id: number;
  selected_answer: string;
  time_spent_seconds: number;
  confidence_level: ConfidenceLevel;
}

const CONFIDENCE_OPTIONS: {
  value: ConfidenceLevel;
  label: string;
  description: string;
  activeClass: string;
  inactiveClass: string;
}[] = [
  {
    value: 'low',
    label: 'Low',
    description: 'Just guessing',
    activeClass: 'bg-amber-500/25 border-amber-400/60 text-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.18)]',
    inactiveClass: 'border-white/10 text-white/40 hover:bg-amber-500/10 hover:border-amber-400/30 hover:text-amber-300/70',
  },
  {
    value: 'medium',
    label: 'Medium',
    description: 'Somewhat sure',
    activeClass: 'bg-indigo-500/25 border-indigo-400/60 text-indigo-300 shadow-[0_0_16px_rgba(99,102,241,0.18)]',
    inactiveClass: 'border-white/10 text-white/40 hover:bg-indigo-500/10 hover:border-indigo-400/30 hover:text-indigo-300/70',
  },
  {
    value: 'high',
    label: 'High',
    description: 'Very confident',
    activeClass: 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.18)]',
    inactiveClass: 'border-white/10 text-white/40 hover:bg-emerald-500/10 hover:border-emerald-400/30 hover:text-emerald-300/70',
  },
];

export default function QuizView() {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [startTime, setStartTime] = useState(Date.now());
  const [loadingPhase, setLoadingPhase] = useState<'loading' | 'generating'>('loading');
  const [quizError, setQuizError] = useState<'rate_limited' | 'failed' | null>(null);
  const phaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchQuiz = async () => {
    setLoading(true);
    setQuizError(null);
    setLoadingPhase('loading');
    if (phaseTimer.current) clearTimeout(phaseTimer.current);
    phaseTimer.current = setTimeout(() => setLoadingPhase('generating'), 3000);

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/api/quiz?topic_id=${topicId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions);
      } else if (res.status === 503) {
        setQuizError('rate_limited');
      } else {
        setQuizError('failed');
      }
    } catch (_err: unknown) {
      setQuizError('failed');
    } finally {
      if (phaseTimer.current) clearTimeout(phaseTimer.current);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuiz();
    return () => { if (phaseTimer.current) clearTimeout(phaseTimer.current); };
  }, [topicId]);

  const isLastQuestion = currentIndex === questions.length - 1;
  const canProceed = selectedAnswer !== null && confidence !== null;

  const handleProceed = async () => {
    if (!canProceed || submitting) return;

    const timeSpent = Math.round((Date.now() - startTime) / 1000);

    const newAnswer: Answer = {
      question_id: questions[currentIndex].question_id,
      selected_answer: selectedAnswer!,
      time_spent_seconds: timeSpent,
      confidence_level: confidence!,
    };

    const newAnswers = [...answers, newAnswer];
    setAnswers(newAnswers);

    if (!isLastQuestion) {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setConfidence(null);
      setStartTime(Date.now());
    } else {
      setSubmitting(true);
      await submitQuiz(newAnswers);
    }
  };

  const submitQuiz = async (finalAnswers: Answer[]) => {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/quiz/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ topic_id: topicId, answers: finalAnswers })
    });

    if (res.ok) {
      const result = await res.json();
      navigate('/results', { state: { result } });
    } else {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-surface p-10 text-center">
          <div className="glass-spinner mx-auto mb-4" />
          {loadingPhase === 'loading' ? (
            <p className="text-white/50 text-sm">Preparing your quiz…</p>
          ) : (
            <>
              <p className="text-white/70 text-sm font-medium">AI is generating questions for this topic…</p>
              <p className="text-white/35 text-xs mt-1.5">This may take a few seconds</p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (quizError) {
    const isRateLimited = quizError === 'rate_limited';
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-surface p-10 text-center max-w-sm w-full">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{
              background: isRateLimited ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
              border: `1px solid ${isRateLimited ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}
          >
            {isRateLimited
              ? <AlertTriangle size={22} className="text-amber-400" />
              : <AlertCircle size={22} className="text-red-400" />
            }
          </div>
          <p className="text-white/80 font-semibold mb-1">
            {isRateLimited ? 'AI service is busy' : 'Could not generate questions'}
          </p>
          <p className="text-white/40 text-sm mb-6">
            {isRateLimited
              ? 'The AI is experiencing high demand. Please wait a moment and try again.'
              : 'Something went wrong while preparing your quiz. Please try again.'
            }
          </p>
          <button onClick={fetchQuiz} className="glass-btn glass-btn-primary w-full justify-center">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const progress = (currentIndex / questions.length) * 100;

  // Hint text shown below the proceed button when not ready
  const missingHint = !selectedAnswer
    ? 'Select an answer to continue'
    : !confidence
    ? 'Select your confidence level to continue'
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl glass-surface p-8">

        {/* Progress */}
        <div className="mb-7">
          <div className="flex justify-between items-center text-xs text-white/40 mb-2">
            <span>Question {currentIndex + 1} of {questions.length}</span>
            <span>{'★'.repeat(currentQ.difficulty)}{'☆'.repeat(5 - currentQ.difficulty)}</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #818cf8, #a78bfa)'
              }}
            />
          </div>
        </div>

        {/* Question */}
        <h2 className="text-xl font-semibold text-white/95 mb-8 leading-relaxed">
          {currentQ.question_text}
        </h2>

        {/* Answer Options */}
        <div className="space-y-3 mb-8">
          {currentQ.options.map((opt, idx) => {
            const isSelected = selectedAnswer === opt;
            return (
              <button
                key={idx}
                onClick={() => setSelectedAnswer(selectedAnswer === opt ? null : opt)}
                className={`w-full text-left px-4 py-3.5 rounded-xl border flex items-center gap-3 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                  isSelected
                    ? 'bg-indigo-500/20 border-indigo-400/55 shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                    : 'border-white/9 hover:bg-white/5 hover:border-white/18'
                }`}
                style={{ background: isSelected ? undefined : 'rgba(255,255,255,0.035)' }}
              >
                <span
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold flex-shrink-0 transition-all duration-200 ${
                    isSelected
                      ? 'bg-indigo-500/40 text-indigo-200'
                      : 'bg-white/7 text-white/40'
                  }`}
                >
                  {String.fromCharCode(65 + idx)}
                </span>
                <span className={`flex-1 text-[0.9375rem] transition-colors duration-200 ${isSelected ? 'text-white/95' : 'text-white/75'}`}>
                  {opt}
                </span>
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Confidence Meter */}
        <div className="mb-7">
          <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">
            Confidence Level
          </p>
          <div className="flex gap-2">
            {CONFIDENCE_OPTIONS.map((opt) => {
              const isActive = confidence === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setConfidence(confidence === opt.value ? null : opt.value)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 px-3 rounded-xl border transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                    isActive ? opt.activeClass : opt.inactiveClass
                  }`}
                  style={{ background: isActive ? undefined : 'rgba(255,255,255,0.025)' }}
                >
                  <span className="text-sm font-semibold leading-tight">{opt.label}</span>
                  <span className="text-xs opacity-70 leading-tight">{opt.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Proceed Button */}
        <div>
          <button
            onClick={handleProceed}
            disabled={!canProceed || submitting}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm border transition-all duration-200 ${
              canProceed && !submitting
                ? 'bg-gradient-to-r from-indigo-500/75 to-violet-500/75 border-indigo-400/40 text-white shadow-[0_4px_20px_rgba(99,102,241,0.30)] hover:shadow-[0_6px_28px_rgba(99,102,241,0.45)] hover:-translate-y-0.5'
                : 'bg-white/4 border-white/8 text-white/25 cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
                Submitting…
              </>
            ) : isLastQuestion ? (
              <>
                <Send size={16} />
                Submit Quiz
              </>
            ) : (
              <>
                Next Question
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {/* Inline hint when button is locked */}
          {missingHint && !submitting && (
            <p className="text-center text-xs text-white/30 mt-2.5">{missingHint}</p>
          )}
        </div>

      </div>
    </div>
  );
}

import { useLocation, Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { CheckCircle, XCircle, ArrowRight, Lightbulb, MessageCircle, Send, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface QuestionResult {
  question_id: number;
  question_text: string;
  options: string[];
  selected_answer: string;
  correct_answer: string;
  is_correct: boolean;
  explanation: string;
}

interface QuizResult {
  score: number;
  total_questions: number;
  correct_count: number;
  results: QuestionResult[];
  conceptMasteryUpdates?: Record<string, number>;
}

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

function QuestionChat({ question, token }: { question: QuestionResult; token: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [isOpen, messages, loading]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/quiz/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question_id: question.question_id,
          question_text: question.question_text,
          options: question.options,
          correct_answer: question.correct_answer,
          selected_answer: question.selected_answer,
          is_correct: question.is_correct,
          explanation: question.explanation,
          chat_history: messages,
          user_message: trimmed,
        }),
      });

      if (res.ok) {
        const { reply } = await res.json();
        setMessages(prev => [...prev, { role: 'ai', content: reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: 'Something went wrong. Please try again.' }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'ai', content: 'Failed to reach the server. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4">
      <button
        onClick={() => setIsOpen(o => !o)}
        className="flex items-center gap-1.5 text-sm text-indigo-300 hover:text-indigo-200 font-medium transition-colors"
      >
        <MessageCircle size={14} />
        {isOpen ? 'Close chat' : 'Ask a follow-up question'}
        {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {isOpen && (
        <div className="mt-3 glass-chat-container">
          <div className="glass-chat-area">
            {messages.length === 0 && (
              <p className="text-sm text-white/30 text-center pt-10 self-center w-full">
                Ask anything about this question or explanation.
              </p>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={msg.role === 'user' ? 'glass-msg-user self-end' : 'glass-msg-ai'}>
                {msg.role === 'ai' ? (
                  <div className="glass-prose prose prose-sm max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            ))}

            {loading && (
              <div className="glass-msg-ai">
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="glass-chat-input-area">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Ask a follow-up question..."
              disabled={loading}
              className="glass-input flex-1"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="glass-btn glass-btn-primary px-3"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Results() {
  const location = useLocation();
  const result = location.state?.result as QuizResult;
  const token = localStorage.getItem('token') ?? '';

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-surface p-8 text-center text-white/60">No results found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Score Card */}
        <div className="glass-surface p-10 text-center">
          <div className="glass-score-ring mx-auto">
            <span className="text-4xl font-bold text-white/95">{result.score}%</span>
          </div>
          <h1 className="text-2xl font-bold text-white/95 mb-2 tracking-tight">Quiz Complete!</h1>
          <p className="text-white/55">
            You got <strong className="text-white/85">{result.correct_count}</strong> out of{' '}
            <strong className="text-white/85">{result.total_questions}</strong> correct.
          </p>
          <div className="mt-7">
            <Link
              to="/dashboard"
              className="glass-btn glass-btn-primary px-7 py-2.5 inline-flex"
            >
              Back to Dashboard <ArrowRight size={18} />
            </Link>
          </div>
        </div>

        {/* Concept Mastery Updates */}
        {result.conceptMasteryUpdates && Object.keys(result.conceptMasteryUpdates).length > 0 && (() => {
          const entries = Object.entries(result.conceptMasteryUpdates).sort(([, a], [, b]) => a - b);
          return (
            <div className="glass-surface p-6">
              <h2 className="text-sm font-bold text-white/90 mb-4">Concept Mastery Updated</h2>
              <div className="space-y-3">
                {entries.map(([tag, mastery]) => {
                  const pct = Math.round(mastery * 100);
                  const tier =
                    mastery < 0.50
                      ? { bar: 'rgba(245,158,11,0.70)', text: '#fcd34d', label: 'Needs work' }
                      : mastery < 0.70
                      ? { bar: 'rgba(99,102,241,0.70)',  text: '#a5b4fc', label: 'Progressing' }
                      : { bar: 'rgba(52,211,153,0.70)',  text: '#6ee7b7', label: 'Mastered' };
                  return (
                    <div key={tag}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-white/75 capitalize">{tag}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/40">{tier.label}</span>
                          <span className="text-sm font-bold tabular-nums" style={{ color: tier.text }}>{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
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
          );
        })()}

        {/* Detailed Breakdown */}
        <div>
          <h2 className="text-lg font-semibold text-white/90 mb-4">Detailed Breakdown</h2>

          <div className="space-y-5">
            {result.results.map((q, idx) => (
              <div
                key={idx}
                className={`glass-surface p-6 ${q.is_correct
                  ? 'border-emerald-500/20'
                  : 'border-red-500/20'
                }`}
                style={{
                  borderColor: q.is_correct
                    ? 'rgba(16,185,129,0.22)'
                    : 'rgba(239,68,68,0.22)'
                }}
              >
                <div className="flex items-start gap-4 mb-5">
                  <div className={`mt-0.5 flex-shrink-0 ${q.is_correct ? 'text-emerald-400' : 'text-red-400'}`}>
                    {q.is_correct ? <CheckCircle size={22} /> : <XCircle size={22} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base text-white/95 mb-4 leading-relaxed">
                      {q.question_text}
                    </h3>

                    <div className="space-y-2 mb-5">
                      {q.options.map((opt, optIdx) => {
                        let cls = 'glass-opt-neutral';
                        if (opt === q.correct_answer) cls = 'glass-opt-correct';
                        else if (opt === q.selected_answer && !q.is_correct) cls = 'glass-opt-wrong';

                        return (
                          <div key={optIdx} className={cls}>
                            <span className="inline-block w-6 font-bold opacity-55 mr-1">
                              {String.fromCharCode(65 + optIdx)}
                            </span>
                            {opt}
                            {opt === q.correct_answer && (
                              <span className="ml-2 text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/25">
                                Correct
                              </span>
                            )}
                            {opt === q.selected_answer && !q.is_correct && (
                              <span className="ml-2 text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full border border-red-500/25">
                                Your Answer
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* AI Explanation */}
                    <div className="glass-ai-box">
                      <div className="glass-ai-header">
                        <Lightbulb size={15} />
                        AI Explanation
                      </div>
                      <div className="glass-prose text-sm">
                        <ReactMarkdown>{q.explanation}</ReactMarkdown>
                      </div>

                      <QuestionChat question={q} token={token} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

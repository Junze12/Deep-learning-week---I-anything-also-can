import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, ChevronRight } from 'lucide-react';

interface QuizSession {
  session_id: string;
  timestamp: string;
  total_questions: number;
  correct_count: number;
  score: number;
}

export default function TopicHistory() {
  const { id: subjectId, topicId } = useParams();
  const navigate = useNavigate();
  const [history, setHistory] = useState<QuizSession[]>([]);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem('token');

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/quiz/history/${topicId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          setHistory(await res.json());
        }
      } catch (error) {
        console.error('Failed to fetch history', error);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [topicId, token]);

  const handleViewSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/quiz/session/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const result = await res.json();
        navigate('/results', { state: { result } });
      }
    } catch (error) {
      console.error('Failed to fetch session details', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-spinner" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link to={`/subject/${subjectId}`} className="glass-back-link mb-6 inline-flex">
        <ArrowLeft size={18} /> Back to Topics
      </Link>

      <h1 className="text-2xl font-bold text-white/95 tracking-tight mb-8">Quiz History</h1>

      <div className="space-y-3">
        {history.map((session) => (
          <button
            key={session.session_id}
            onClick={() => handleViewSession(session.session_id)}
            className="glass-card w-full p-6 flex items-center justify-between text-left group"
          >
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span
                  className={`text-2xl font-bold ${
                    session.score >= 80
                      ? 'score-high'
                      : session.score >= 50
                      ? 'score-mid'
                      : 'score-low'
                  }`}
                >
                  {session.score}%
                </span>
                <span className="text-white/25">|</span>
                <span className="text-white/65 font-medium text-sm">
                  {session.correct_count}/{session.total_questions} Correct
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-white/35">
                <Clock size={13} />
                {new Date(session.timestamp).toLocaleString()}
              </div>
            </div>

            <div className="text-white/30 group-hover:text-indigo-300 transition-colors">
              <ChevronRight size={22} />
            </div>
          </button>
        ))}

        {history.length === 0 && (
          <div className="glass-empty">
            No quiz history found for this topic.
          </div>
        )}
      </div>
    </div>
  );
}

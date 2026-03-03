import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, BookOpen, LogOut, Trash2, Calendar } from 'lucide-react';

interface Subject {
  id: number;
  subject_name: string;
  exam_date: string;
  target_grade?: string;
}

export default function Dashboard() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [newSubject, setNewSubject] = useState('');
  const [examDate, setExamDate] = useState('');
  const [targetGrade, setTargetGrade] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showProactiveModal, setShowProactiveModal] = useState(false);
  const [loadingProactive, setLoadingProactive] = useState(false);
  const [proactiveSuggestions, setProactiveSuggestions] = useState<any[]>([]);
  const [proactiveSummary, setProactiveSummary] = useState('');
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');

  const fetchSubjects = async () => {
    const res = await fetch('/api/subjects', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      setSubjects(await res.json());
    }
  };

  useEffect(() => {
    fetchSubjects();
  }, []);

  useEffect(() => {
    if (!subjects.length) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    const lastShown = localStorage.getItem('proactive_suggest_last');
    if (lastShown === todayKey) return;

    const firstSubjectId = subjects[0].id;
    setLoadingProactive(true);
    fetch('/api/calendar/suggest-dates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ subject_id: String(firstSubjectId) })
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setProactiveSuggestions(data.suggestions);
          setProactiveSummary(data.summary || '');
          setShowProactiveModal(true);
          localStorage.setItem('proactive_suggest_last', todayKey);
        }
      })
      .catch((err) => console.error('Proactive suggestions error', err))
      .finally(() => setLoadingProactive(false));
  }, [subjects.length]);

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const res = await fetch('/api/subjects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        subject_name: newSubject,
        exam_date: examDate,
        target_grade: targetGrade
      })
    });

    if (res.ok) {
      setShowModal(false);
      setNewSubject('');
      setExamDate('');
      setTargetGrade('');
      fetchSubjects();
    }
  };

  const handleDeleteSubject = async (e: React.MouseEvent, subjectId: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (!window.confirm('Are you sure you want to delete this subject? All topics and questions will be lost.')) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/subjects/${subjectId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        fetchSubjects();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete subject');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('An error occurred while deleting');
    }
  };

  const addProactiveSuggestions = async () => {
    try {
      const res = await fetch('/api/calendar/batch-add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ events: proactiveSuggestions })
      });
      if (res.ok) {
        setShowProactiveModal(false);
        setProactiveSuggestions([]);
      }
    } catch (error) {
      console.error('Failed to add proactive suggestions', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <header className="flex justify-between items-start mb-10 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white/95 tracking-tight leading-tight">
            Welcome back, {user.name}
          </h1>
          <p className="text-white/50 mt-1 text-sm">Track and accelerate your learning</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/calendar"
            className="glass-btn glass-btn-secondary"
            title="Study Calendar"
          >
            <Calendar size={18} />
          </Link>
          <Link
            to="/report"
            className="glass-btn glass-btn-secondary text-indigo-300"
          >
            <BookOpen size={18} /> View Report
          </Link>
          <button
            onClick={handleLogout}
            className="glass-btn glass-btn-secondary text-white/55 hover:text-red-400"
          >
            <LogOut size={18} /> Logout
          </button>
        </div>
      </header>

      {/* Section Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-white/90">Your Subjects</h2>
        <button
          onClick={() => setShowModal(true)}
          className="glass-btn glass-btn-primary"
        >
          <Plus size={18} /> Add Subject
        </button>
      </div>

      {/* Subjects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {subjects.map(subject => (
          <Link
            key={subject.id}
            to={`/subject/${subject.id}`}
            className="glass-card block p-6 relative group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="glass-icon-box">
                <BookOpen size={22} />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {subject.target_grade && (
                  <span className="glass-badge glass-badge-purple">
                    Target: {subject.target_grade}
                  </span>
                )}
                {subject.exam_date && (
                  <span className="glass-badge glass-badge-gray">
                    {new Date(subject.exam_date).toLocaleDateString()}
                  </span>
                )}
                <button
                  onClick={(e) => handleDeleteSubject(e, subject.id)}
                  className="glass-icon-btn glass-icon-btn-danger z-10 relative"
                  title="Delete Subject"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <h3 className="text-base font-bold text-white/95 mb-1">{subject.subject_name}</h3>
            <p className="text-xs text-white/40">Click to manage topics & quizzes</p>
          </Link>
        ))}
      </div>

      {subjects.length === 0 && (
        <div className="glass-empty mt-6">
          <BookOpen size={36} className="mx-auto mb-3 text-white/20" />
          <p className="text-sm">No subjects yet. Add one to get started!</p>
        </div>
      )}

      {/* Add Subject Modal */}
      {showModal && (
        <div className="glass-modal-overlay">
          <div className="glass-modal">
            <h3 className="text-xl font-bold text-white/95 mb-5">Add New Subject</h3>
            <form onSubmit={handleCreateSubject} className="space-y-4">
              <div>
                <label className="glass-label">Subject Name</label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="glass-input"
                  placeholder="e.g. Mathematics"
                  required
                />
              </div>
              <div>
                <label className="glass-label">Target Grade (Optional)</label>
                <select
                  value={targetGrade}
                  onChange={(e) => setTargetGrade(e.target.value)}
                  className="glass-input"
                >
                  <option value="">Select Grade</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                  <option value="Pass">Pass</option>
                </select>
              </div>
              <div>
                <label className="glass-label">Exam Date (Optional)</label>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="glass-input"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="glass-btn glass-btn-secondary flex-1 justify-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="glass-btn glass-btn-primary flex-1 justify-center"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Proactive Suggestions Modal */}
      {showProactiveModal && (
        <div className="glass-modal-overlay">
          <div className="glass-modal">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white/95">Suggested Study Sessions</h3>
              <button onClick={() => setShowProactiveModal(false)} className="glass-icon-btn">
                <span className="text-white/70">×</span>
              </button>
            </div>

            {loadingProactive ? (
              <div className="space-y-3 animate-pulse">
                <div className="glass-skeleton h-20 w-full" />
                <div className="glass-skeleton h-20 w-full" />
                <div className="glass-skeleton h-20 w-full" />
              </div>
            ) : (
              <>
                {proactiveSummary && (
                  <div className="glass-ai-box mb-4">
                    <div className="glass-ai-header">Why these suggestions</div>
                    <p className="text-xs text-white/70 leading-relaxed">{proactiveSummary}</p>
                  </div>
                )}

                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {proactiveSuggestions.map((s, idx) => (
                    <div key={idx} className="glass-surface p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-white/90">
                          {s.title || s.topic_name || s.subject_name}
                        </span>
                        <span className="text-xs text-white/40">{s.event_date} at {s.event_time}</span>
                      </div>
                      {s.topic_name && (
                        <span className="text-sm text-indigo-300/80">{s.topic_name}</span>
                      )}
                      {s.remarks && (
                        <p className="text-xs text-white/50 mt-1">{s.remarks}</p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowProactiveModal(false)}
                    className="glass-btn glass-btn-secondary flex-1 justify-center"
                  >
                    Not now
                  </button>
                  <button
                    onClick={addProactiveSuggestions}
                    className="glass-btn glass-btn-primary flex-1 justify-center"
                    disabled={proactiveSuggestions.length === 0}
                  >
                    Add to Calendar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

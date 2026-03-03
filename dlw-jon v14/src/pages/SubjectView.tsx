import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Plus, PlayCircle, ArrowLeft, Upload, FileText, X, Brain, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Topic {
  id: number;
  topic_name: string;
  description?: string;
  goal?: string;
  weight: number;
  documents?: { filename: string; file_path: string }[];
}

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

export default function SubjectView() {
  const { id } = useParams();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [subjectName, setSubjectName] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [weight, setWeight] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [showModal, setShowModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const token = localStorage.getItem('token');

  const fetchTopics = async () => {
    const res = await fetch(`/api/topics?subject_id=${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      setTopics(await res.json());
    }
  };

  const fetchSubjectName = async () => {
    const res = await fetch('/api/subjects', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const subjects = await res.json();
      const subject = subjects.find((s: any) => String(s.id) === id);
      if (subject) setSubjectName(subject.subject_name);
    }
  };

  useEffect(() => {
    fetchTopics();
    fetchSubjectName();
  }, [id]);

  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [messages, chatOpen]);

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append('subject_id', id || '');
    formData.append('topic_name', newTopic);
    formData.append('description', description);
    formData.append('goal', goal);
    formData.append('weight', String(weight));

    files.forEach(file => {
      formData.append('documents', file);
    });

    const res = await fetch('/api/topics', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    if (res.ok) {
      setShowModal(false);
      setNewTopic('');
      setDescription('');
      setGoal('');
      setWeight(1);
      setFiles([]);
      fetchTopics();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || chatLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch(`/api/subjects/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chat_history: messages, user_message: trimmed }),
      });
      if (res.ok) {
        const { reply } = await res.json();
        setMessages(prev => [...prev, { role: 'ai', content: reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: 'Something went wrong. Please try again.' }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'ai', content: 'Failed to reach the server.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <Link to="/dashboard" className="glass-back-link mb-6 inline-flex">
        <ArrowLeft size={18} /> Back to Dashboard
      </Link>

      <div className={`flex gap-6 items-start transition-all duration-300`}>

        {/* ── Topics column ─────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-8 gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white/95 tracking-tight">
              {subjectName || 'Topics'}
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setChatOpen(o => !o)}
                className={`glass-btn ${chatOpen ? 'glass-btn-primary' : 'glass-btn-secondary'}`}
              >
                <Brain size={16} />
                {chatOpen ? 'Close Coach' : 'Study Coach'}
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="glass-btn glass-btn-primary"
              >
                <Plus size={18} /> Add Topic
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {topics.map(topic => (
              <div key={topic.id} className="glass-surface p-6 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base text-white/95 mb-1">{topic.topic_name}</h3>
                  {topic.description && (
                    <p className="text-white/55 text-sm mb-2 leading-relaxed">{topic.description}</p>
                  )}
                  {topic.goal && (
                    <p className="text-sm text-indigo-300 font-medium">
                      Goal: {topic.goal}
                    </p>
                  )}
                  {topic.documents && topic.documents.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {topic.documents.map((doc, idx) => (
                        <div key={idx} className="glass-file-chip">
                          <FileText size={11} />
                          <span className="truncate">{doc.filename}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  <Link
                    to={`/subject/${id}/topic/${topic.id}/history`}
                    className="glass-btn glass-btn-secondary text-sm"
                  >
                    History
                  </Link>
                  <Link
                    to={`/subject/${id}/topic/${topic.id}/add-question`}
                    className="glass-btn glass-btn-secondary text-indigo-300 text-sm"
                  >
                    Add Questions
                  </Link>
                  <Link
                    to={`/quiz/${topic.id}`}
                    className="glass-btn glass-btn-success text-sm"
                  >
                    <PlayCircle size={16} /> Start Quiz
                  </Link>
                </div>
              </div>
            ))}

            {topics.length === 0 && (
              <div className="glass-empty">
                No topics yet. Add one to get started!
              </div>
            )}
          </div>
        </div>

        {/* ── Chat panel ────────────────────────────────── */}
        {chatOpen && (
          <div
            className="w-[360px] flex-shrink-0 glass-surface flex flex-col"
            style={{ height: 'calc(100vh - 7rem)', position: 'sticky', top: '1.5rem' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/8 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="glass-icon-box-violet" style={{ width: 28, height: 28 }}>
                  <Brain size={14} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/90 leading-tight">Study Coach</p>
                  {subjectName && (
                    <p className="text-[11px] text-white/40 leading-tight">{subjectName}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="text-white/35 hover:text-white/70 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-sm text-white/30 text-center pt-10 px-2">
                  Ask me anything about {subjectName ? `${subjectName}` : 'this subject'} — your topics, study strategies, or specific concepts.
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

              {chatLoading && (
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

            {/* Input */}
            <div className="p-3 border-t border-white/8 flex gap-2 flex-shrink-0">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Ask about your topics..."
                disabled={chatLoading}
                className="glass-input flex-1 text-sm"
              />
              <button
                onClick={sendMessage}
                disabled={chatLoading || !chatInput.trim()}
                className="glass-btn glass-btn-primary px-3"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Topic Modal */}
      {showModal && (
        <div className="glass-modal-overlay">
          <div className="glass-modal max-h-[90vh] overflow-y-auto" style={{ maxWidth: '30rem' }}>
            <h3 className="text-xl font-bold text-white/95 mb-5">Add New Topic</h3>
            <form onSubmit={handleAddTopic} className="space-y-4">
              <div>
                <label className="glass-label">Topic Name</label>
                <input
                  type="text"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  className="glass-input"
                  placeholder="e.g. Quadratic Equations"
                  required
                />
              </div>
              <div>
                <label className="glass-label">Description (Optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="glass-input"
                  rows={3}
                  placeholder="Brief description of this topic..."
                />
              </div>
              <div>
                <label className="glass-label">Learning Goal (Optional)</label>
                <input
                  type="text"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="glass-input"
                  placeholder="e.g. Master quadratic equations"
                />
              </div>

              <div>
                <label className="glass-label">
                  Importance Weight
                  <span className="ml-2 text-white/35 font-normal text-xs">1 = normal · 3 = high priority</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={3}
                  value={weight}
                  onChange={(e) => setWeight(Math.min(3, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="glass-input"
                />
              </div>

              <div>
                <label className="glass-label">Related Documents</label>
                <div
                  className="glass-dropzone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mx-auto text-white/30 mb-2" size={22} />
                  <p className="text-sm text-white/45">Drag & drop files or click to select</p>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                  />
                </div>

                {files.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {files.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between glass-file-chip w-full max-w-full px-3 py-1.5">
                        <span className="truncate text-xs">{file.name}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                          className="text-white/35 hover:text-red-400 transition-colors ml-2 flex-shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
                  Add Topic
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

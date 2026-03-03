import { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';

export default function QuestionCreate() {
  const { subjectId, topicId } = useParams();
  const [activeTab, setActiveTab] = useState<'manual' | 'upload'>('manual');
  const [formData, setFormData] = useState({
    question_text: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correct_answer: '',
    difficulty: 1,
    concept_tags: ''
  });

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, message });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');

    const payload = {
      topic_id: topicId,
      question_text: formData.question_text,
      options: [formData.optionA, formData.optionB, formData.optionC, formData.optionD],
      correct_answer: formData.correct_answer,
      difficulty: formData.difficulty,
      concept_tags: formData.concept_tags.split(',').map(t => t.trim()).filter(Boolean)
    };

    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast('success', 'Question saved successfully!');
        setFormData({
          question_text: '',
          optionA: '',
          optionB: '',
          optionC: '',
          optionD: '',
          correct_answer: '',
          difficulty: 1,
          concept_tags: ''
        });
      } else {
        showToast('error', 'Failed to add question.');
      }
    } catch (error) {
      console.error(error);
      showToast('error', 'Network error — question not saved.');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'json' || ext === 'csv') {
      setFile(file);
      setUploadStatus(null);
    } else {
      setUploadStatus({ type: 'error', message: 'Please upload a JSON or CSV file.' });
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('topic_id', topicId!);

    try {
      const res = await fetch('/api/questions/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();

      if (res.ok) {
        setUploadStatus({ type: 'success', message: data.message });
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        setUploadStatus({ type: 'error', message: data.error || 'Upload failed' });
      }
    } catch (error) {
      console.error(error);
      setUploadStatus({ type: 'error', message: 'Network error during upload' });
    }
  };

  const jsonSample = `[
  {
    "question_text": "What is 2+2?",
    "options": ["3", "4", "5", "6"],
    "correct_answer": "4",
    "difficulty": 1,
    "concept_tags": ["math", "addition"]
  }
]`;

  const csvSample = `question_text,option1,option2,option3,option4,correct_answer,difficulty,concept_tags
What is 2+2?,3,4,5,6,4,1,"math, addition"`;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link to={`/subject/${subjectId}`} className="glass-back-link mb-6 inline-flex">
        <ArrowLeft size={18} /> Back to Subject
      </Link>

      <div className="glass-surface overflow-hidden">
        {/* Tabs */}
        <div className="glass-tab-bar">
          <button
            className={`glass-tab ${activeTab === 'manual' ? 'glass-tab-active' : ''}`}
            onClick={() => setActiveTab('manual')}
          >
            Manual Entry
          </button>
          <button
            className={`glass-tab ${activeTab === 'upload' ? 'glass-tab-active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            Bulk Upload (JSON / CSV)
          </button>
        </div>

        <div className="p-8">
          {activeTab === 'manual' ? (
            <>
              <h1 className="text-2xl font-bold text-white/95 tracking-tight mb-7">Add Question Manually</h1>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="glass-label">Question Text</label>
                  <textarea
                    value={formData.question_text}
                    onChange={(e) => setFormData({ ...formData, question_text: e.target.value })}
                    className="glass-input"
                    rows={3}
                    placeholder="Enter your question here..."
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {['A', 'B', 'C', 'D'].map((opt) => (
                    <div key={opt}>
                      <label className="glass-label">Option {opt}</label>
                      <input
                        type="text"
                        value={(formData as any)[`option${opt}`]}
                        onChange={(e) => setFormData({ ...formData, [`option${opt}`]: e.target.value })}
                        className="glass-input"
                        placeholder={`Option ${opt}`}
                        required
                      />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="glass-label">Correct Answer</label>
                    <select
                      value={formData.correct_answer}
                      onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
                      className="glass-input"
                      required
                    >
                      <option value="">Select Correct Option</option>
                      <option value={formData.optionA}>Option A</option>
                      <option value={formData.optionB}>Option B</option>
                      <option value={formData.optionC}>Option C</option>
                      <option value={formData.optionD}>Option D</option>
                    </select>
                  </div>
                  <div>
                    <label className="glass-label">Difficulty (1–5)</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={formData.difficulty}
                      onChange={(e) => setFormData({ ...formData, difficulty: parseInt(e.target.value) })}
                      className="glass-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="glass-label">Concept Tags <span className="text-white/30 font-normal">(comma-separated, optional)</span></label>
                  <input
                    type="text"
                    value={formData.concept_tags}
                    onChange={(e) => setFormData({ ...formData, concept_tags: e.target.value })}
                    className="glass-input"
                    placeholder="e.g. recursion, base case, call stack"
                  />
                </div>

                <button
                  type="submit"
                  className="glass-btn glass-btn-primary w-full justify-center py-3"
                >
                  Save Question
                </button>
              </form>
            </>
          ) : (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white/95 tracking-tight mb-2">Upload Questions</h2>
                <p className="text-white/45 text-sm">Drag and drop your JSON or CSV file</p>
              </div>

              <div
                className={`glass-dropzone ${dragActive ? 'glass-dropzone-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".json,.csv"
                  onChange={handleChange}
                />

                {file ? (
                  <div className="flex flex-col items-center">
                    <FileText size={44} className="text-indigo-400 mb-4" />
                    <p className="font-semibold text-white/90 text-lg mb-1">{file.name}</p>
                    <p className="text-sm text-white/40 mb-6">{(file.size / 1024).toFixed(2)} KB</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                        className="glass-btn glass-btn-secondary"
                      >
                        Remove
                      </button>
                      <button
                        onClick={handleUpload}
                        className="glass-btn glass-btn-primary"
                      >
                        Upload File
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={44} className="text-white/25 mb-4" />
                    <p className="font-medium text-white/70 text-lg mb-1">Click to upload or drag and drop</p>
                    <p className="text-sm text-white/35">JSON or CSV files only</p>
                  </div>
                )}
              </div>

              {uploadStatus && (
                <div className={`flex items-center gap-3 p-4 rounded-xl ${
                  uploadStatus.type === 'success' ? 'glass-alert-success' : 'glass-alert-error'
                }`}>
                  {uploadStatus.type === 'success'
                    ? <CheckCircle size={18} />
                    : <AlertCircle size={18} />
                  }
                  {uploadStatus.message}
                </div>
              )}

              <hr className="glass-divider" />

              <div className="grid md:grid-cols-2 gap-7">
                <div>
                  <h3 className="font-semibold text-white/80 mb-3 flex items-center gap-2 text-sm">
                    <span className="glass-badge glass-badge-blue">JSON</span> Format
                  </h3>
                  <pre className="glass-code">{jsonSample}</pre>
                </div>
                <div>
                  <h3 className="font-semibold text-white/80 mb-3 flex items-center gap-2 text-sm">
                    <span className="glass-badge glass-badge-green">CSV</span> Format
                  </h3>
                  <pre className="glass-code">{csvSample}</pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl glass-toast ${
            toast.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
              : 'bg-red-500/15 border-red-400/30 text-red-300'
          }`}
        >
          {toast.type === 'success'
            ? <CheckCircle size={17} className="flex-shrink-0" />
            : <AlertCircle size={17} className="flex-shrink-0" />
          }
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );
}

import { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';

export default function ContextCreate() {
  const { subjectId, topicId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'text' | 'pdf'>('text');
  const [textContent, setTextContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textContent.trim()) return;

    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/contexts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          topic_id: topicId,
          content: textContent,
          type: 'text'
        })
      });

      if (res.ok) {
        setUploadStatus({ type: 'success', message: 'Context added successfully!' });
        setTextContent('');
      } else {
        setUploadStatus({ type: 'error', message: 'Failed to add context' });
      }
    } catch (error) {
      console.error(error);
      setUploadStatus({ type: 'error', message: 'Error adding context' });
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
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
    if (ext === 'pdf') {
      setFile(file);
      setUploadStatus(null);
    } else {
      setUploadStatus({ type: 'error', message: 'Please upload a PDF file.' });
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('topic_id', topicId!);
    formData.append('type', 'pdf');

    try {
      const res = await fetch('/api/contexts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();

      if (res.ok) {
        setUploadStatus({ type: 'success', message: 'PDF uploaded and processed successfully!' });
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

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link to={`/subject/${subjectId}`} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-6">
        <ArrowLeft size={20} /> Back to Subject
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="border-b border-gray-100 flex">
          <button
            className={`flex-1 py-4 text-center font-medium ${activeTab === 'text' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
            onClick={() => { setActiveTab('text'); setUploadStatus(null); }}
          >
            Text Input
          </button>
          <button
            className={`flex-1 py-4 text-center font-medium ${activeTab === 'pdf' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
            onClick={() => { setActiveTab('pdf'); setUploadStatus(null); }}
          >
            PDF Upload
          </button>
        </div>

        <div className="p-8">
          {activeTab === 'text' ? (
            <>
              <h1 className="text-2xl font-bold mb-6">Add Context (Text)</h1>
              <form onSubmit={handleTextSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-1">Context Content</label>
                  <textarea
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-64"
                    placeholder="Paste your study material here..."
                    required
                  />
                </div>

                <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium">
                  Save Context
                </button>
              </form>
            </>
          ) : (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">Upload PDF Context</h2>
                <p className="text-gray-500">Drag and drop your PDF file here. Text will be extracted automatically.</p>
              </div>

              <div 
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input 
                  ref={fileInputRef}
                  type="file" 
                  className="hidden" 
                  accept=".pdf"
                  onChange={handleChange}
                />
                
                {file ? (
                  <div className="flex flex-col items-center">
                    <FileText size={48} className="text-red-500 mb-4" />
                    <p className="font-medium text-lg mb-2">{file.name}</p>
                    <p className="text-sm text-gray-500 mb-6">{(file.size / 1024).toFixed(2)} KB</p>
                    <div className="flex gap-3">
                      <button 
                        onClick={() => { setFile(null); if(fileInputRef.current) fileInputRef.current.value = ''; }}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                      >
                        Remove
                      </button>
                      <button 
                        onClick={handleUpload}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                      >
                        Upload & Extract
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={48} className="text-gray-400 mb-4" />
                    <p className="font-medium text-lg mb-1">Click to upload or drag and drop</p>
                    <p className="text-sm text-gray-500">PDF files only</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {uploadStatus && (
            <div className={`mt-6 p-4 rounded-lg flex items-center gap-3 ${uploadStatus.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {uploadStatus.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
              {uploadStatus.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

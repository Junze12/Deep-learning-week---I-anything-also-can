import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function Register() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    target_grade: '',
    preferred_study_time_per_day: ''
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          learning_profile: {
            target_grade: formData.target_grade || undefined,
            preferred_study_time_per_day: formData.preferred_study_time_per_day
              ? parseInt(formData.preferred_study_time_per_day)
              : undefined,
          }
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md glass-surface p-9">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-white/95 tracking-tight mb-1">Create account</h2>
          <p className="text-sm text-white/50">Start your learning journey</p>
        </div>

        {error && <div className="glass-alert-error mb-5">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="glass-label">Full Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="glass-input"
              placeholder="Jane Smith"
              required
            />
          </div>
          <div>
            <label className="glass-label">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="glass-input"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="glass-label">Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="glass-input"
              placeholder="••••••••"
              required
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="glass-label">
                Target Grade
                <span className="ml-1.5 text-white/35 font-normal text-xs">(optional)</span>
              </label>
              <input
                type="text"
                value={formData.target_grade}
                onChange={(e) => setFormData({ ...formData, target_grade: e.target.value })}
                className="glass-input"
                placeholder="e.g. A, 90%"
              />
            </div>
            <div className="flex-1">
              <label className="glass-label">
                Daily Study Goal
                <span className="ml-1.5 text-white/35 font-normal text-xs">mins (optional)</span>
              </label>
              <input
                type="number"
                min={5}
                max={480}
                value={formData.preferred_study_time_per_day}
                onChange={(e) => setFormData({ ...formData, preferred_study_time_per_day: e.target.value })}
                className="glass-input"
                placeholder="e.g. 60"
              />
            </div>
          </div>
          <button
            type="submit"
            className="glass-btn glass-btn-primary w-full justify-center py-2.5 mt-2"
          >
            Create Account
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white/50">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-300 hover:text-indigo-200 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

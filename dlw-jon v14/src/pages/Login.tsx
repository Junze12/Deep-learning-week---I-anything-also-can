import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Login failed');

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
          <h2 className="text-2xl font-bold text-white/95 tracking-tight mb-1">Welcome back</h2>
          <p className="text-sm text-white/50">Sign in to your account</p>
        </div>

        {error && <div className="glass-alert-error mb-5">{error}</div>}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="glass-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="glass-input"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="glass-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="glass-input"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            className="glass-btn glass-btn-primary w-full justify-center py-2.5 mt-2"
          >
            Sign In
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white/50">
          Don't have an account?{' '}
          <Link to="/register" className="text-indigo-300 hover:text-indigo-200 transition-colors">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}

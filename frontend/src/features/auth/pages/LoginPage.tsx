import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, getMe } from '@/features/auth/api';

const LoginPage = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getMe()
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => setChecking(false));
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) return null;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: 'var(--dt-bg)' }}
    >
      <div className="w-full max-w-sm">
        <div
          className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] overflow-hidden"
          style={{ border: '1px solid var(--dt-border)' }}
        >
          <div className="h-1.5 w-full" style={{ background: 'var(--dt-primary)' }} />

          <div className="p-8">
            <div className="mb-8 text-center">
              <div className="flex justify-center mb-4">
                <img
                  src={`${import.meta.env.BASE_URL}favicon-logo.png`}
                  alt="innotium"
                  style={{ height: '48px', width: '48px', objectFit: 'contain' }}
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement;
                    el.style.display = 'none';
                    const fallback = el.nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div
                  className="items-center justify-center w-12 h-12 rounded-xl"
                  style={{ display: 'none', background: 'var(--dt-primary)' }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </div>
              </div>
              <h1
                className="mt-1 text-2xl font-bold"
                style={{ color: 'var(--dt-text-primary)' }}
              >
                DevTicket
              </h1>
              <p
                className="mt-1 text-sm"
                style={{ color: 'var(--dt-text-muted)' }}
              >
                개발 티켓 관리 시스템
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'var(--dt-text-secondary)' }}
                >
                  아이디
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  placeholder="아이디를 입력하세요"
                  className="w-full px-3 py-2.5 rounded-lg text-sm transition-all focus:outline-none"
                  style={{
                    border: '1px solid var(--dt-border)',
                    backgroundColor: 'var(--dt-bg)',
                    color: 'var(--dt-text-primary)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--dt-primary)';
                    e.currentTarget.style.boxShadow = 'var(--dt-focus-ring)';
                    e.currentTarget.style.backgroundColor = '#fff';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--dt-border)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.backgroundColor = 'var(--dt-bg)';
                  }}
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'var(--dt-text-secondary)' }}
                >
                  비밀번호
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="비밀번호를 입력하세요"
                  className="w-full px-3 py-2.5 rounded-lg text-sm transition-all focus:outline-none"
                  style={{
                    border: '1px solid var(--dt-border)',
                    backgroundColor: 'var(--dt-bg)',
                    color: 'var(--dt-text-primary)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--dt-primary)';
                    e.currentTarget.style.boxShadow = 'var(--dt-focus-ring)';
                    e.currentTarget.style.backgroundColor = '#fff';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--dt-border)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.backgroundColor = 'var(--dt-bg)';
                  }}
                />
              </div>

              {error && (
                <p
                  className="text-sm rounded-lg px-3 py-2 flex items-center gap-2"
                  style={{
                    color: 'var(--dt-tone-urgent)',
                    backgroundColor: 'var(--dt-tone-urgent-bg)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-50"
                style={{ background: 'var(--dt-primary)' }}
                onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = 'var(--dt-primary-dark)'; }}
                onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = 'var(--dt-primary)'; }}
              >
                {loading ? '로그인 중...' : '로그인'}
              </button>
            </form>
          </div>
        </div>

        <p
          className="mt-5 text-center text-xs"
          style={{ color: 'var(--dt-text-muted)' }}
        >
          © {new Date().getFullYear()} Innotium. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;

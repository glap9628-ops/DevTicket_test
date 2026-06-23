import { useEffect, useRef, useState } from 'react';
import { getMe, logout, changePassword } from '@/features/auth/api';
import type { User, UserRole } from '@/types/auth';

const ROLE_LABEL: Record<UserRole, string> = {
  REQUESTER: '요청자',
  DEVELOPER: '개발자',
  ADMIN: '관리자',
};

const ROLE_DESC: Record<UserRole, string> = {
  ADMIN: '시스템 관리자',
  DEVELOPER: '개발자',
  REQUESTER: '요청자',
};


/* ── 비밀번호 유효성 ─────────────────────────────────────────── */
const checkPw = (pw: string) => ({
  len:     pw.length >= 8,
  lower:   /[a-z]/.test(pw),
  upper:   /[A-Z]/.test(pw),
  number:  /[0-9]/.test(pw),
  special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pw),
});

/* ── 비밀번호 변경 모달 ──────────────────────────────────────── */
const PasswordModal = ({ onClose }: { onClose: () => void }) => {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNext, setShowNext] = useState(false);

  const check = checkPw(form.next);
  const validTypes = [check.lower, check.upper, check.number, check.special].filter(Boolean).length;
  const isStrong = check.len && validTypes >= 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!check.len) { setError('새 비밀번호는 8자 이상이어야 합니다.'); return; }
    if (validTypes < 3) { setError('영문 대/소문자, 숫자, 특수문자 중 3가지 이상 조합해야 합니다.'); return; }
    if (form.next !== form.confirm) { setError('새 비밀번호가 일치하지 않습니다.'); return; }
    setLoading(true);
    try {
      await changePassword(form.current, form.next);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '비밀번호 변경에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const strengthLabel = () => {
    if (!form.next) return null;
    if (isStrong) return { text: '강함', cls: 'text-green-600' };
    if (validTypes >= 2 && check.len) return { text: '보통', cls: 'text-amber-600' };
    return { text: '약함', cls: 'text-red-500' };
  };
  const sl = strengthLabel();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        style={{ border: '1px solid var(--dt-border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--dt-border)' }}
        >
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center w-7 h-7 rounded-lg"
              style={{ backgroundColor: 'var(--dt-primary-light)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round"
                stroke="currentColor"
                style={{ color: 'var(--dt-primary)' }}
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h2
              className="text-sm font-semibold"
              style={{ color: 'var(--dt-text-primary)' }}
            >
              비밀번호 변경
            </h2>
          </div>
          <button
            onClick={onClose}
            className="transition-colors"
            style={{ color: 'var(--dt-text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--dt-text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--dt-text-muted)'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div
                className="flex items-center justify-center w-12 h-12 rounded-full"
                style={{ backgroundColor: 'var(--dt-tone-done-bg)' }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                  stroke="currentColor" style={{ color: 'var(--dt-tone-done)' }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--dt-text-secondary)' }}
              >
                비밀번호가 변경되었습니다.
              </p>
              <button
                onClick={onClose}
                className="mt-1 px-5 py-2 rounded-lg text-white text-sm font-medium transition-colors"
                style={{ background: 'var(--dt-primary)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--dt-primary-dark)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--dt-primary)'}
              >
                확인
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* 안내 박스 */}
              <div
                className="rounded-lg px-3 py-2.5 text-xs space-y-1 leading-relaxed"
                style={{
                  backgroundColor: 'var(--dt-bg)',
                  border: '1px solid var(--dt-border)',
                  color: 'var(--dt-text-secondary)',
                }}
              >
                <p
                  className="font-semibold flex items-center gap-1"
                  style={{ color: 'var(--dt-primary)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  개인정보보호법 안내
                </p>
                <ul className="space-y-0.5 pl-1">
                  <li>• 비밀번호는 <strong>8자 이상</strong>으로 설정해야 합니다.</li>
                  <li>• 영문 대/소문자, 숫자, 특수문자 중 <strong>3가지 이상</strong> 조합해야 합니다.</li>
                  <li>• 이름, 생년월일 등 개인정보가 포함된 비밀번호는 사용하지 마세요.</li>
                  <li>• 비밀번호는 주기적으로 변경하는 것을 권장합니다.</li>
                </ul>
              </div>

              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--dt-text-secondary)' }}
                >
                  현재 비밀번호
                </label>
                <input
                  type="password"
                  value={form.current}
                  onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
                  required
                  className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-all"
                  style={{ border: '1px solid var(--dt-border)', color: 'var(--dt-text-primary)' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--dt-primary)'; e.currentTarget.style.boxShadow = 'var(--dt-focus-ring)'; }}
                  onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--dt-border)';   e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    className="text-xs font-medium"
                    style={{ color: 'var(--dt-text-secondary)' }}
                  >
                    새 비밀번호
                  </label>
                  {sl && <span className={`text-xs font-semibold ${sl.cls}`}>{sl.text}</span>}
                </div>
                <div className="relative">
                  <input
                    type={showNext ? 'text' : 'password'}
                    value={form.next}
                    onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
                    required
                    placeholder="8자 이상"
                    className="w-full px-3 py-2 pr-9 text-sm rounded-lg focus:outline-none transition-all"
                    style={{ border: '1px solid var(--dt-border)', color: 'var(--dt-text-primary)' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--dt-primary)'; e.currentTarget.style.boxShadow = 'var(--dt-focus-ring)'; }}
                    onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--dt-border)';   e.currentTarget.style.boxShadow = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNext((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: 'var(--dt-text-muted)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--dt-text-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--dt-text-muted)'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {showNext
                        ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                        : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
                    </svg>
                  </button>
                </div>
                {form.next && (
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {[
                      { ok: check.len,     label: '8자 이상' },
                      { ok: check.lower,   label: '영문 소문자' },
                      { ok: check.upper,   label: '영문 대문자' },
                      { ok: check.number,  label: '숫자' },
                      { ok: check.special, label: '특수문자' },
                    ].map(({ ok, label }) => (
                      <span key={label} className={`flex items-center gap-1 text-xs ${ok ? 'text-green-600' : ''}`}
                        style={!ok ? { color: 'var(--dt-text-muted)' } : {}}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          {ok ? <polyline points="20 6 9 17 4 12"/> : <circle cx="12" cy="12" r="10"/>}
                        </svg>
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--dt-text-secondary)' }}
                >
                  새 비밀번호 확인
                </label>
                <input
                  type="password"
                  value={form.confirm}
                  onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
                  required
                  className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-all"
                  style={{ border: '1px solid var(--dt-border)', color: 'var(--dt-text-primary)' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--dt-primary)'; e.currentTarget.style.boxShadow = 'var(--dt-focus-ring)'; }}
                  onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--dt-border)';   e.currentTarget.style.boxShadow = 'none'; }}
                />
                {form.confirm && form.next !== form.confirm && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--dt-tone-urgent)' }}>
                    비밀번호가 일치하지 않습니다.
                  </p>
                )}
              </div>

              {error && (
                <p className="text-xs flex items-center gap-1" style={{ color: 'var(--dt-tone-urgent)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {error}
                </p>
              )}

              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 rounded-lg text-sm transition-colors"
                  style={{
                    border: '1px solid var(--dt-border)',
                    color: 'var(--dt-text-secondary)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--dt-bg)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60 transition-colors"
                  style={{ background: 'var(--dt-primary)' }}
                  onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = 'var(--dt-primary-dark)'; }}
                  onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = 'var(--dt-primary)'; }}
                >
                  {loading ? '변경 중...' : '변경'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── 메인 컴포넌트 ───────────────────────────────────────────── */
export const UserMenuButton = ({ user }: { user: User | null }) => {
  const [localUser, setLocalUser] = useState<User | null>(user);
  const [open, setOpen] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      getMe()
        .then(setLocalUser)
        .catch(() => { window.location.replace('/devticket/login'); });
    } else {
      setLocalUser(user);
    }
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    window.location.replace('/devticket/login');
  };

  const displayName = localUser?.displayName ?? localUser?.username ?? '?';
  const username    = localUser?.username ?? '—';
  const role        = localUser?.role;
  const deptName    = localUser?.groupName || '—';

  return (
    <>
      <div ref={ref} className="relative flex items-center gap-1.5">
        {/* 이름 */}
        <span
          className="text-sm font-medium select-none hidden sm:block"
          style={{ color: 'var(--dt-text-secondary)' }}
        >
          {displayName}
        </span>

        {/* 비밀번호 변경 아이콘 */}
        <button
          onClick={() => setShowPwModal(true)}
          className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
          style={{ color: 'var(--dt-text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--dt-text-primary)';
            e.currentTarget.style.backgroundColor = 'var(--dt-bg)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--dt-text-muted)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title="비밀번호 변경"
          aria-label="비밀번호 변경"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </button>

        {/* 아바타 버튼 */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-center w-8 h-8 rounded-full transition-colors"
          style={{
            backgroundColor: 'var(--dt-bg)',
            border: '1px solid var(--dt-border)',
            color: 'var(--dt-text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--dt-primary-light)';
            e.currentTarget.style.borderColor = 'var(--dt-primary)';
            e.currentTarget.style.color = 'var(--dt-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--dt-bg)';
            e.currentTarget.style.borderColor = 'var(--dt-border)';
            e.currentTarget.style.color = 'var(--dt-text-secondary)';
          }}
          aria-label="사용자 메뉴"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </button>

        {/* ── 드롭다운 ── */}
        {open && (
          <div
            className="absolute right-0 mt-2 w-64 rounded-xl overflow-hidden z-50 bg-white shadow-xl"
            style={{ top: '100%', border: '1px solid var(--dt-border)' }}
          >
            {/* 프로필 헤더 */}
            <div
              className="px-4 py-4 flex items-start gap-3"
              style={{ borderBottom: '1px solid var(--dt-border)' }}
            >
              <div
                className="flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: 'var(--dt-primary-light)',
                  border: '1px solid var(--dt-border)',
                  color: 'var(--dt-primary)',
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p
                  className="text-sm font-bold truncate"
                  style={{ color: 'var(--dt-text-primary)' }}
                >
                  {displayName}
                  <span
                    className="font-normal ml-1"
                    style={{ color: 'var(--dt-text-muted)' }}
                  >
                    ({username})
                  </span>
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: 'var(--dt-text-muted)' }}
                >
                  {role ? ROLE_DESC[role] : '—'}
                </p>
                {role && (
                  <span
                    className="inline-block mt-1.5 px-2 py-0.5 rounded text-xs font-medium"
                    style={{ backgroundColor: 'var(--dt-primary-light)', color: 'var(--dt-primary)' }}
                  >
                    {ROLE_LABEL[role]}
                  </span>
                )}
              </div>
            </div>

            {/* 상세 정보 */}
            <div
              className="px-4 pb-3 pt-3 space-y-2"
              style={{ borderBottom: '1px solid var(--dt-border)' }}
            >
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="w-14 text-xs flex-shrink-0"
                  style={{ color: 'var(--dt-text-muted)' }}
                >
                  부서
                </span>
                <span
                  className="font-medium"
                  style={{ color: 'var(--dt-text-primary)' }}
                >
                  {deptName}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="w-14 text-xs flex-shrink-0"
                  style={{ color: 'var(--dt-text-muted)' }}
                >
                  사원번호
                </span>
                <span
                  className="font-medium"
                  style={{ color: 'var(--dt-text-primary)' }}
                >
                  {username}
                </span>
              </div>
            </div>

            {/* 비밀번호 변경 */}
            <div
              className="px-4 pb-3 pt-3"
              style={{ borderBottom: '1px solid var(--dt-border)' }}
            >
              <button
                onClick={() => { setOpen(false); setShowPwModal(true); }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  border: '1px solid var(--dt-border)',
                  color: 'var(--dt-text-secondary)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--dt-bg)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                비밀번호 변경
              </button>
            </div>

            {/* 로그아웃 */}
            <div className="px-4 pb-4 pt-3">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm text-white font-medium transition-colors"
                style={{ background: 'var(--dt-primary-dark)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--dt-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--dt-primary-dark)'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                로그아웃
              </button>
            </div>
          </div>
        )}
      </div>

      {showPwModal && <PasswordModal onClose={() => setShowPwModal(false)} />}
    </>
  );
};

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getDashboard } from '@/features/dashboard/api';
import { getMe } from '@/features/auth/api';
import { getTickets, updateUrgent, adminPatchReview } from '@/features/ticket/api';
import type { AdminReviewPatchData } from '@/features/ticket/api';
import { createUser, deleteUser, getGroups, getUsers, syncSsoUsers, updateUser } from '@/features/admin/api';
import type { AdminUser, GroupOption, SsoSyncResult, UpdateUserData } from '@/features/admin/api';
import Badge from '@/components/ui/Badge';
import StatusBadge from '@/components/ui/StatusBadge';
import TypeBadge from '@/components/ui/TypeBadge';
import type { DeveloperStat, TicketSummary } from '@/types/ticket';
import { DIFFICULTY_COLOR } from '@/types/ticket';

type Tab = 'tickets' | 'users';

// group_id → tone 매핑은 API 응답 group_name 기반으로 런타임에 결정
const TONE_BY_NAME: Record<string, 'progress' | 'admin' | 'waiting' | 'done' | 'neutral'> = {
  DevOps: 'progress',
  '기술연구소': 'admin',
  QA: 'waiting',
  '영업': 'done',
  AX컨설팅: 'waiting',
  AX기획: 'admin',
};
function groupTone(name: string): 'progress' | 'admin' | 'waiting' | 'done' | 'neutral' {
  return TONE_BY_NAME[name] ?? 'neutral';
}

// ─── 아이디 유효성 ──────────────────────────────────────────────────────────────
const USERNAME_RE = /^[a-zA-Z0-9_-]+$/;

function validateCreate(form: {
  username: string;
  password: string;
  display_name: string;
}): string | null {
  if (!form.username.trim()) return '아이디를 입력해주세요.';
  if (form.username.trim().length < 3) return '아이디는 3자 이상이어야 합니다.';
  if (form.username.trim().length > 50) return '아이디는 50자 이하여야 합니다.';
  if (!USERNAME_RE.test(form.username.trim()))
    return '아이디는 영문, 숫자, _ - 만 사용할 수 있습니다.';
  if (!form.password) return '비밀번호를 입력해주세요.';
  if (form.password.length < 8) return '비밀번호는 8자 이상이어야 합니다.';
  if (!form.display_name.trim()) return '이름을 입력해주세요.';
  return null;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ─── 티켓 모달 ──────────────────────────────────────────────────────────────────
const TicketModal = ({
  assigneeId,
  assigneeName,
  statuses,
  title,
  onClose,
  navigate,
}: {
  assigneeId: number;
  assigneeName: string;
  statuses?: number[];
  title?: string;
  onClose: () => void;
  navigate: (path: string) => void;
}) => {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const targetStatuses = statuses ?? [4, 5];
    Promise.all(
      targetStatuses.map((status) => getTickets({ assigneeId, status: status as never, size: 50 })),
    )
      .then((responses) => setTickets(responses.flatMap((r) => r.content)))
      .finally(() => setLoading(false));
  }, [assigneeId, statuses]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              {title ?? `${assigneeName} 티켓 목록`}
            </h3>
            <p className="mt-1 text-xs text-gray-400">총 {tickets.length}건</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            aria-label="닫기"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto p-3">
          {loading ? (
            <div className="py-10 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : tickets.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">표시할 티켓이 없습니다.</div>
          ) : (
            <table className="dt-table">
              <thead>
                <tr>
                  <th>티켓번호</th>
                  <th>제목</th>
                  <th className="dt-col-center">상태</th>
                  <th className="dt-col-center">유형</th>
                  <th className="dt-col-center">난이도</th>
                  <th className="dt-col-center">등록일</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="cursor-pointer transition-colors hover:bg-[#f6f7f8]"
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                  >
                    <td>
                      <span className="font-mono text-xs text-[var(--dt-primary)]">{ticket.ticketNo}</span>
                    </td>
                    <td className="dt-col-title" title={ticket.title}>
                      <div className="flex items-center gap-2">
                        {ticket.isUrgent && (
                          <Badge
                            tone="urgent"
                            variant="soft"
                            size="xs"
                            icon={<span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
                          >
                            긴급
                          </Badge>
                        )}
                        <span className="font-medium text-gray-900">{ticket.title}</span>
                      </div>
                    </td>
                    <td className="dt-col-center">
                      <StatusBadge status={ticket.status} variant="outline" />
                    </td>
                    <td className="dt-col-center">
                      <TypeBadge type={ticket.ticketType} showLabel />
                    </td>
                    <td className="dt-col-center">
                      {ticket.difficulty ? (
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${DIFFICULTY_COLOR[ticket.difficulty]}`}>
                          {DIFFICULTY_LABELS[ticket.difficulty]}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                    <td className="dt-col-center text-xs text-gray-500">
                      {formatDate(ticket.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── 개발 검토 수정 모달 ────────────────────────────────────────────────────────
const DIFFICULTY_LABELS: Record<number, string> = { 1: '하', 2: '중', 3: '상' };
const PRIORITY_LABELS: Record<number, string>   = { 1: '낮음', 2: '보통', 3: '높음', 4: '긴급' };

const ReviewEditModal = ({
  ticket,
  onClose,
  onSaved,
}: {
  ticket: TicketSummary;
  onClose: () => void;
  onSaved: (updated: TicketSummary) => void;
}) => {
  const [form, setForm] = useState<AdminReviewPatchData>({
    difficulty:     ticket.difficulty,
    expectedEffort: ticket.expectedEffort,
    effortUnit:     ticket.effortUnit ?? 'MD',
    priority:       ticket.priority,
    desiredDueDate: ticket.desiredDueDate ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await adminPatchReview(ticket.id, form);
      onSaved({
        ...ticket,
        difficulty:      result.difficulty,
        expectedEffort:  result.expectedEffort,
        effortUnit:      result.effortUnit,
        priority:        result.priority,
        requestedDueDate: result.requestedDueDate,
        desiredDueDate:  result.desiredDueDate,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">개발 검토 수정</h3>
            <p className="mt-1 text-xs text-gray-400 truncate max-w-[240px]" title={ticket.title}>{ticket.ticketNo} · {ticket.title}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            aria-label="닫기"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {/* 난이도 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">난이도</label>
            <select
              className="dt-input w-full text-sm"
              value={form.difficulty ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, difficulty: e.target.value ? Number(e.target.value) : undefined }))}
            >
              <option value="">선택 안함</option>
              {Object.entries(DIFFICULTY_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
          {/* 예상 공수 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">예상 공수</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step={0.5}
                className="dt-input flex-1 text-sm"
                placeholder="숫자 입력"
                value={form.expectedEffort ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, expectedEffort: e.target.value ? Number(e.target.value) : undefined }))}
              />
              <select
                className="dt-input w-24 text-sm"
                value={form.effortUnit ?? 'MD'}
                onChange={(e) => setForm((p) => ({ ...p, effortUnit: e.target.value }))}
              >
                <option value="MD">MD</option>
                <option value="HOUR">시간</option>
              </select>
            </div>
          </div>
          {/* 우선순위 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">우선순위</label>
            <select
              className="dt-input w-full text-sm"
              value={form.priority ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value ? Number(e.target.value) : undefined }))}
            >
              <option value="">선택 안함</option>
              {Object.entries(PRIORITY_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
          {/* 요청자 희망일 (읽기 전용 참고) */}
          {ticket.requestedDueDate && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ background: '#f5f3ef', color: '#78716c' }}>
              요청자 희망일: <span className="font-semibold" style={{ color: '#44403c' }}>{ticket.requestedDueDate}</span>
            </div>
          )}
          {/* 확정 완료일 (관리자 입력) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">확정 완료일</label>
            <input
              type="date"
              className="dt-input w-full text-sm"
              value={form.desiredDueDate ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, desiredDueDate: e.target.value || undefined }))}
            />
          </div>
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-600">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="dt-btn dt-btn-secondary text-xs">
              취소
            </button>
            <button type="submit" disabled={saving} className="dt-btn dt-btn-primary text-xs">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── 사용자 편집 모달 ────────────────────────────────────────────────────────────
const UserEditModal = ({
  user,
  groups,
  onClose,
  onSaved,
  onDeleted,
}: {
  user: AdminUser;
  groups: GroupOption[];
  onClose: () => void;
  onSaved: (user: AdminUser) => void;
  onDeleted: (id: number) => void;
}) => {
  const [form, setForm] = useState({
    display_name: user.display_name,
    email: user.email ?? '',
    group_id: user.group_id,
    role: user.role,
    password: '',
    is_active: user.is_active,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  // 필드 유효성 검사
  const validate = (): string | null => {
    if (!form.display_name.trim()) return '이름을 입력해주세요.';
    if (form.password && form.password.length < 8) return '비밀번호는 8자 이상이어야 합니다.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError('');
    try {
      const payload: UpdateUserData = {
        display_name: form.display_name.trim(),
        email: form.email.trim() || null,
        group_id: form.group_id,
        role: form.role,
        is_active: form.is_active,
      };
      if (form.password.trim()) payload.password = form.password.trim();
      const updated = await updateUser(user.id, payload);
      onSaved(updated);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '사용자 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    setError('');
    try {
      await deleteUser(user.id);
      onDeleted(user.id);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '사용자 삭제에 실패했습니다.');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">사용자 편집</h3>
            <p className="mt-1 text-xs text-gray-400">@{user.username}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            aria-label="닫기"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {/* 이름 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              이름 <span className="text-rose-500">*</span>
            </label>
            <input
              className="dt-input w-full text-sm"
              value={form.display_name}
              onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))}
            />
          </div>
          {/* 이메일 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">이메일</label>
            <input
              type="email"
              className="dt-input w-full text-sm"
              placeholder="선택 입력"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
          </div>
          {/* 부서 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">부서</label>
            <select
              className="dt-input w-full text-sm"
              value={form.group_id}
              onChange={(e) => setForm((p) => ({ ...p, group_id: Number(e.target.value) }))}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          {/* 권한 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">권한</label>
            <select
              className="dt-input w-full text-sm"
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as 'admin' | 'user' }))}
            >
              <option value="user">일반 사용자</option>
              <option value="admin">관리자</option>
            </select>
          </div>
          {/* 비밀번호 변경 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              비밀번호 변경
              <span className="ml-1 text-gray-400">(8자 이상, 비워두면 유지)</span>
            </label>
            <input
              type="password"
              className="dt-input w-full text-sm"
              placeholder="변경할 비밀번호"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            />
          </div>
          {/* 활성화 */}
          <label className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
            <span className="text-sm text-gray-700">계정 활성화</span>
            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.is_active ? 'bg-[var(--dt-primary)]' : 'bg-gray-200'}`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-4' : 'translate-x-1'}`}
              />
            </button>
          </label>
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-600">
              {error}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-2">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">정말 삭제하시겠습니까?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {deleting ? '삭제 중...' : '확인'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50"
              >
                삭제
              </button>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="dt-btn dt-btn-secondary text-xs">
                취소
              </button>
              <button type="submit" disabled={saving} className="dt-btn dt-btn-primary text-xs">
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────────
const AdminPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'users' ? 'users' : 'tickets';

  // 티켓 관리
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [devStats, setDevStats] = useState<DeveloperStat[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState('');
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [reviewEditTicket, setReviewEditTicket] = useState<TicketSummary | null>(null);
  const [devModal, setDevModal] = useState<{
    assigneeId: number; assigneeName: string; statuses?: number[]; title?: string;
  } | null>(null);

  // 사용자 관리
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<SsoSyncResult | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // 그룹 목록 (동적 로드)
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  // 사용자 생성 폼
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({
    username: '',
    password: '',
    display_name: '',
    group_id: 0,   // 그룹 로드 후 첫 번째 그룹으로 초기화
    isAdmin: false,
  });

  // 권한 확인
  useEffect(() => {
    getMe()
      .then((me) => {
        if (me.role !== 'ADMIN') navigate('/board', { replace: true });
      })
      .catch(() => navigate('/login', { replace: true }));
  }, [navigate]);

  // 티켓/개발자 현황 로드
  useEffect(() => {
    Promise.all([getTickets({ size: 100 }), getDashboard()])
      .then(([ticketResponse, dashboard]) => {
        setTickets(ticketResponse.content);
        setDevStats(dashboard.developerStats);
      })
      .catch(() => setTicketsError('티켓 데이터를 불러오지 못했습니다.'))
      .finally(() => setTicketsLoading(false));
  }, []);

  // 사용자 탭 전환 시 그룹+사용자 목록 로드
  useEffect(() => {
    if (tab !== 'users') return;

    setGroupsLoading(true);
    getGroups()
      .then((gs) => {
        setGroups(gs);
        setCreateForm((prev) => ({
          ...prev,
          group_id: prev.group_id === 0 && gs.length > 0 ? gs[0].id : prev.group_id,
        }));
      })
      .catch(() => {/* 그룹 로드 실패는 silent — 폼에서 빈 select로 표시 */})
      .finally(() => setGroupsLoading(false));

    setUsersLoading(true);
    setUsersError('');
    getUsers(1, 500)
      .then((r) => setUsers(r.items))
      .catch((e) => setUsersError(e instanceof Error ? e.message : '사용자 목록을 불러오지 못했습니다.'))
      .finally(() => setUsersLoading(false));
  }, [tab]);

  const handleTabChange = (nextTab: Tab) => {
    setSearchParams((prev) => { prev.set('tab', nextTab); return prev; }, { replace: true });
  };

  const handleUrgentToggle = async (ticket: TicketSummary) => {
    setTogglingId(ticket.id);
    try {
      const updated = await updateUrgent(ticket.id, !ticket.isUrgent);
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? { ...t, isUrgent: updated.isUrgent } : t)));
    } finally {
      setTogglingId(null);
    }
  };

  const handleSsoSync = async () => {
    setSyncLoading(true);
    setSyncResult(null);
    try {
      const result = await syncSsoUsers();
      setSyncResult(result);
      // 목록 갱신
      const r = await getUsers(1, 500);
      setUsers(r.items);
    } catch (e) {
      setSyncResult({ created: 0, updated: 0, deactivated: 0, message: e instanceof Error ? e.message : 'SSO 동기화 실패' });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    // 프론트 유효성 검사
    const validationError = validateCreate(createForm);
    if (validationError) { setCreateError(validationError); return; }

    setCreateLoading(true);
    setCreateError('');
    try {
      const created = await createUser({
        username: createForm.username.trim(),
        password: createForm.password,
        display_name: createForm.display_name.trim(),
        group_id: createForm.group_id,
        role: createForm.isAdmin ? 'admin' : 'user',
      });
      setUsers((prev) => [created, ...prev]);
      setShowCreateForm(false);
      setCreateForm({
        username: '',
        password: '',
        display_name: '',
        group_id: groups[0]?.id ?? 0,
        isAdmin: false,
      });
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : '사용자 생성에 실패했습니다.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleToggleActive = async (user: AdminUser) => {
    try {
      const updated = await updateUser(user.id, { is_active: !user.is_active });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (e) {
      alert(e instanceof Error ? e.message : '상태 변경에 실패했습니다.');
    }
  };

  const userRows = useMemo(() => users, [users]);

  return (
    <div className="dt-page">
      {reviewEditTicket && (
        <ReviewEditModal
          ticket={reviewEditTicket}
          onClose={() => setReviewEditTicket(null)}
          onSaved={(updated) => {
            setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setReviewEditTicket(null);
          }}
        />
      )}
      {devModal && (
        <TicketModal
          assigneeId={devModal.assigneeId}
          assigneeName={devModal.assigneeName}
          statuses={devModal.statuses}
          title={devModal.title}
          onClose={() => setDevModal(null)}
          navigate={navigate}
        />
      )}
      {selectedUser && (
        <UserEditModal
          user={selectedUser}
          groups={groups}
          onClose={() => setSelectedUser(null)}
          onSaved={(updated) =>
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
          }
          onDeleted={(id) => setUsers((prev) => prev.filter((u) => u.id !== id))}
        />
      )}

      <div className="dt-page-header">
        <div>
          <h1 className="dt-page-title">관리자</h1>
          <p className="dt-page-subtitle">티켓 우선순위와 사용자 계정을 관리합니다.</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="mb-1 flex gap-1 border-b border-gray-200">
        {([
          ['tickets', '티켓 관리'],
          ['users', '사용자 관리'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-[var(--dt-primary)] text-[var(--dt-primary)]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ─── 티켓 관리 탭 ─── */}
      {tab === 'tickets' && (
        <>
          {ticketsLoading ? (
            <div className="dt-card p-8 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : ticketsError ? (
            <div className="dt-card p-8 text-center text-sm text-gray-400">{ticketsError}</div>
          ) : (
            <>
              <div className="dt-card p-5">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">긴급 우선순위 설정</h2>
                  <p className="mt-1 text-xs text-gray-400">
                    전체 티켓의 긴급 플래그를 바로 조정할 수 있습니다.
                  </p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                <table className="dt-table">
                  <thead>
                    <tr>
                      <th>티켓번호</th>
                      <th>제목</th>
                      <th className="dt-col-center">유형</th>
                      <th className="dt-col-center">상태</th>
                      <th className="dt-col-center">등록일</th>
                      <th className="dt-col-center">긴급</th>
                      <th className="dt-col-center">평가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket) => (
                      <tr
                        key={ticket.id}
                        className="cursor-pointer transition-colors hover:bg-[#f6f7f8]"
                        onClick={() => navigate(`/tickets/${ticket.id}`)}
                      >
                        <td>
                          <span className="font-mono text-xs text-[var(--dt-primary)]">{ticket.ticketNo}</span>
                        </td>
                        <td className="dt-col-title font-medium text-gray-900" title={ticket.title}>{ticket.title}</td>
                        <td className="dt-col-center">
                          <TypeBadge type={ticket.ticketType} showLabel />
                        </td>
                        <td className="dt-col-center">
                          <StatusBadge status={ticket.status} variant="outline" />
                        </td>
                        <td className="dt-col-center text-sm text-gray-500">
                          {formatDate(ticket.createdAt)}
                        </td>
                        <td className="dt-col-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleUrgentToggle(ticket)}
                            disabled={togglingId === ticket.id}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--dt-primary)] focus:ring-offset-1 ${
                              ticket.isUrgent ? 'bg-[var(--dt-primary)]' : 'bg-gray-200'
                            } ${togglingId === ticket.id ? 'opacity-50' : ''}`}
                            aria-label={ticket.isUrgent ? '긴급 해제' : '긴급 설정'}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                                ticket.isUrgent ? 'translate-x-4' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="dt-col-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setReviewEditTicket(ticket)}
                            className="rounded-lg px-2 py-1 text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                            title="개발 검토 수정"
                          >
                            {ticket.difficulty != null || ticket.priority != null ? (
                              <span className="flex items-center gap-1">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                수정
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-gray-400">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="12" y1="8" x2="12" y2="12" />
                                  <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                미평가
                              </span>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>

              <div className="dt-card p-5">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">개발자 작업 현황</h2>
                  <p className="mt-1 text-xs text-gray-400">개발자별 진행중/완료 티켓 수</p>
                </div>
                <table className="dt-table">
                  <thead>
                    <tr>
                      <th className="dt-col-center">담당자</th>
                      <th className="dt-col-center">진행중</th>
                      <th className="dt-col-center">완료</th>
                      <th className="dt-col-center">합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devStats.map((stat) => (
                      <tr key={stat.assigneeId}>
                        <td className="dt-col-center font-medium text-gray-800">
                          {stat.assigneeName}
                        </td>
                        <td className="dt-col-center">
                          {stat.inProgressCount > 0 ? (
                            <button
                              className="dt-soft-pill dt-soft-pill-outline-progress text-xs hover:bg-[rgba(96,121,150,0.08)]"
                              onClick={() =>
                                setDevModal({
                                  assigneeId: stat.assigneeId,
                                  assigneeName: stat.assigneeName,
                                })
                              }
                            >
                              {stat.inProgressCount}
                            </button>
                          ) : (
                            <Badge
                              tone="progress"
                              variant="soft"
                              size="xs"
                              icon={<span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
                            >
                              0
                            </Badge>
                          )}
                        </td>
                        <td className="dt-col-center">
                          {stat.doneCount > 0 ? (
                            <button
                              className="dt-soft-pill dt-soft-pill-outline-done text-xs hover:bg-[rgba(95,127,104,0.08)]"
                              onClick={() =>
                                setDevModal({
                                  assigneeId: stat.assigneeId,
                                  assigneeName: stat.assigneeName,
                                  statuses: [6],
                                  title: `${stat.assigneeName} 완료 티켓`,
                                })
                              }
                            >
                              {stat.doneCount}
                            </button>
                          ) : (
                            <Badge
                              tone="done"
                              variant="soft"
                              size="xs"
                              icon={<span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
                            >
                              0
                            </Badge>
                          )}
                        </td>
                        <td className="dt-col-center">
                          {stat.inProgressCount + stat.doneCount > 0 ? (
                            <button
                              className="dt-soft-pill dt-soft-pill-outline text-xs hover:bg-[rgba(0,0,0,0.04)]"
                              onClick={() =>
                                setDevModal({
                                  assigneeId: stat.assigneeId,
                                  assigneeName: stat.assigneeName,
                                  statuses: [4, 5, 6],
                                  title: `${stat.assigneeName} 전체 티켓`,
                                })
                              }
                            >
                              {stat.inProgressCount + stat.doneCount}
                            </button>
                          ) : (
                            <Badge
                              tone="neutral"
                              variant="soft"
                              size="xs"
                              icon={<span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
                            >
                              0
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ─── 사용자 관리 탭 ─── */}
      {tab === 'users' && (
        <div className="dt-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">사용자 목록</h2>
              <p className="mt-1 text-xs text-gray-400">계정 권한과 활성 상태를 관리합니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSsoSync}
                disabled={syncLoading}
                className="dt-btn text-xs border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {syncLoading ? '동기화 중...' : 'SSO 동기화'}
              </button>
              <button
                onClick={() => { setShowCreateForm((p) => !p); setCreateError(''); }}
                className="dt-btn dt-btn-primary text-xs"
              >
                {showCreateForm ? '닫기' : '사용자 추가'}
              </button>
            </div>
          </div>

          {/* SSO 동기화 결과 */}
          {syncResult && (
            <div className={`mb-4 rounded-lg px-4 py-2 text-xs ${syncResult.created >= 0 && !syncResult.message.includes('실패') ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600'}`}>
              {syncResult.message}
            </div>
          )}

          {/* 사용자 생성 폼 */}
          {showCreateForm && (
            <form
              onSubmit={handleCreateUser}
              className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4"
              noValidate
            >
              <h3 className="mb-3 text-xs font-semibold text-gray-600">신규 사용자 등록</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* 아이디 */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    아이디 <span className="text-rose-500">*</span>
                    <span className="ml-1 font-normal text-gray-400">(영문·숫자·_·- / 3자 이상)</span>
                  </label>
                  <input
                    className="dt-input w-full text-sm"
                    placeholder="예: hong_gildong"
                    value={createForm.username}
                    onChange={(e) => setCreateForm((p) => ({ ...p, username: e.target.value }))}
                    autoComplete="off"
                  />
                </div>
                {/* 비밀번호 */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    비밀번호 <span className="text-rose-500">*</span>
                    <span className="ml-1 font-normal text-gray-400">(8자 이상)</span>
                  </label>
                  <input
                    type="password"
                    className="dt-input w-full text-sm"
                    placeholder="8자 이상"
                    value={createForm.password}
                    onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                    autoComplete="new-password"
                  />
                </div>
                {/* 이름 */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    이름 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    className="dt-input w-full text-sm"
                    placeholder="홍길동"
                    value={createForm.display_name}
                    onChange={(e) => setCreateForm((p) => ({ ...p, display_name: e.target.value }))}
                  />
                </div>
                {/* 부서 */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    부서 <span className="text-rose-500">*</span>
                  </label>
                  <select
                    className="dt-input w-full text-sm"
                    value={createForm.group_id}
                    onChange={(e) =>
                      setCreateForm((p) => ({ ...p, group_id: Number(e.target.value) }))
                    }
                    disabled={groupsLoading}
                  >
                    {groupsLoading ? (
                      <option>로딩 중...</option>
                    ) : groups.length === 0 ? (
                      <option value={0}>부서 없음</option>
                    ) : (
                      groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))
                    )}
                  </select>
                </div>
                {/* 관리자 여부 */}
                <label className="sm:col-span-2 flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={createForm.isAdmin}
                    onChange={(e) =>
                      setCreateForm((p) => ({ ...p, isAdmin: e.target.checked }))
                    }
                  />
                  관리자 권한 부여
                </label>
              </div>

              {/* 에러 메시지 */}
              {createError && (
                <div className="mt-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-600">
                  {createError}
                </div>
              )}

              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  className="dt-btn dt-btn-secondary text-xs"
                  onClick={() => { setShowCreateForm(false); setCreateError(''); }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="dt-btn dt-btn-primary text-xs"
                >
                  {createLoading ? '생성 중...' : '생성'}
                </button>
              </div>
            </form>
          )}

          {/* 사용자 목록 */}
          {usersLoading ? (
            <div className="py-8 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : usersError ? (
            <div className="rounded-lg bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-600">
              {usersError}
            </div>
          ) : userRows.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">등록된 사용자가 없습니다.</div>
          ) : (
            <div style={{ overflowY: 'auto', maxHeight: 520 }}>
            <table className="dt-table">
              <thead>
                <tr>
                  <th>아이디</th>
                  <th>이름</th>
                  <th className="dt-col-center">부서 / 권한</th>
                  <th className="dt-col-center">최근 로그인</th>
                  <th className="dt-col-center">활성</th>
                </tr>
              </thead>
              <tbody>
                {userRows.map((user) => (
                  <tr
                    key={user.id}
                    className={`cursor-pointer transition-colors hover:bg-[#f6f7f8] ${user.is_active ? '' : 'opacity-60'}`}
                    onClick={() => setSelectedUser(user)}
                  >
                    <td className="font-mono text-sm text-gray-700">{user.username}</td>
                    <td className="font-medium text-gray-900">{user.display_name}</td>
                    <td className="dt-col-center">
                      <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
                        {/* group_name을 API에서 직접 사용 */}
                        <Badge
                          tone={groupTone(user.group_name)}
                          variant="outline"
                          size="xs"
                          icon={<span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
                        >
                          {user.group_name}
                        </Badge>
                        {user.role === 'admin' && (
                          <Badge
                            tone="admin"
                            variant="soft"
                            size="xs"
                            icon={<span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
                          >
                            관리자
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="dt-col-center text-sm text-gray-500">
                      {formatDate(user.last_login_at)}
                    </td>
                    <td className="dt-col-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          user.is_active ? 'bg-[var(--dt-primary)]' : 'bg-gray-200'
                        }`}
                        aria-label={user.is_active ? '비활성화' : '활성화'}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                            user.is_active ? 'translate-x-4' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPage;

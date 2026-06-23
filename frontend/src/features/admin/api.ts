// ─── 에러 메시지 추출 헬퍼 ─────────────────────────────────────────────────────
// FastAPI/Pydantic 422 응답은 detail 이 배열({ loc, msg, type }[]) 이고,
// 400/409 응답은 detail 이 문자열이다. 두 케이스를 모두 처리한다.
function extractError(err: unknown, fallback: string): string {
  if (!err || typeof err !== 'object') return fallback;
  const e = err as Record<string, unknown>;

  if (typeof e.detail === 'string') return e.detail;

  if (Array.isArray(e.detail)) {
    const msgs = e.detail
      .map((d: unknown) => {
        const item = d as Record<string, unknown>;
        const msg = String(item.msg ?? '').replace(/^Value error, /, '');
        const loc = Array.isArray(item.loc) ? item.loc.slice(1).join('.') : '';
        return loc ? `${loc}: ${msg}` : msg;
      })
      .filter(Boolean);
    return msgs.length > 0 ? msgs.join(' / ') : fallback;
  }

  return fallback;
}

// ─── 인터페이스 ─────────────────────────────────────────────────────────────────

export interface GroupOption {
  id: number;
  name: string;
  is_active: boolean;
}

export interface AdminUser {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  role: 'admin' | 'user';
  group_id: number;
  group_name: string;
  position_id: number | null;
  position_name: string | null;
  role_id: number | null;
  role_name: string | null;
  is_active: boolean;
  avatar_path: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUserData {
  username: string;
  password: string;
  display_name: string;
  group_id: number;
  role?: 'admin' | 'user';
  email?: string | null;
}

export interface UpdateUserData {
  display_name?: string;
  email?: string | null;
  group_id?: number;
  role?: 'admin' | 'user';
  is_active?: boolean;
  password?: string;
}

export interface PaginatedUsers {
  items: AdminUser[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

// ─── API 함수 ────────────────────────────────────────────────────────────────────

export async function getGroups(): Promise<GroupOption[]> {
  const res = await fetch('/api/admin/groups?size=100&is_active=true', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('그룹 목록을 불러오지 못했습니다.');
  const data: { items: GroupOption[] } = await res.json();
  return data.items;
}

export async function getUsers(page = 1, size = 20): Promise<PaginatedUsers> {
  const res = await fetch(`/api/admin/users?page=${page}&size=${size}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('사용자 목록을 불러오지 못했습니다.');
  return res.json();
}

export async function createUser(data: CreateUserData): Promise<AdminUser> {
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ role: 'user', ...data }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractError(err, '사용자 생성에 실패했습니다.'));
  }
  return res.json();
}

export async function updateUser(id: number, data: UpdateUserData): Promise<AdminUser> {
  const res = await fetch(`/api/admin/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractError(err, '사용자 수정에 실패했습니다.'));
  }
  return res.json();
}

export async function deleteUser(id: number): Promise<void> {
  const res = await fetch(`/api/admin/users/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractError(err, '사용자 삭제에 실패했습니다.'));
  }
}

export interface SsoSyncResult {
  created: number;
  updated: number;
  deactivated: number;
  message: string;
}

export async function syncSsoUsers(): Promise<SsoSyncResult> {
  const res = await fetch('/api/admin/sso/sync', {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractError(err, 'SSO 동기화에 실패했습니다.'));
  }
  return res.json();
}

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTicket, changeStatus, pickupTicket, cancelPickup, updateTicket, adminReview, deleteTicket, getDevelopers, assignTicket } from '@/features/ticket/api';
import type { Developer } from '@/features/ticket/api';
import { getMe } from '@/features/auth/api';
import StatusBadge from '@/components/ui/StatusBadge';
import TypeBadge from '@/components/ui/TypeBadge';
import MentionInput from '@/components/mention/MentionInput';
import { highlightMentions } from '@/utils/mentionHighlight';
import { Copy, CheckCheck } from 'lucide-react';
import CommentSection from '@/features/comment/CommentSection';
import type { Ticket, TicketStatus, TicketType } from '@/types/ticket';
import {
  TICKET_STATUS_LABEL, TICKET_TYPE_LABEL, PRODUCT_OPTIONS, PLATFORM_OPTIONS,
  DIFFICULTY_LABEL, DIFFICULTY_COLOR, PRIORITY_LABEL, PRIORITY_COLOR,
} from '@/types/ticket';
import type { User } from '@/types/auth';

interface StatusAction {
  label: string;
  toStatus: TicketStatus;
  requireReason: boolean;
  variant: 'primary' | 'danger' | 'warning' | 'success' | 'secondary';
}

const getStatusActions = (ticket: Ticket, user: User | null): StatusAction[] => {
  if (!user) return [];
  const { status } = ticket;
  const role = user.role;
  const actions: StatusAction[] = [];

  // ── 픽업대기(3) → 픽업 ───────────────────────────────────────
  if (status === 3 && (role === 'DEVELOPER' || role === 'ADMIN')) {
    actions.push({ label: '픽업하기', toStatus: 4, requireReason: false, variant: 'primary' });
  }

  // ── 진행중(4) → 상태 전이 ────────────────────────────────────
  if (status === 4 && (role === 'DEVELOPER' || role === 'ADMIN')) {
    actions.push({ label: 'QA검증 요청', toStatus: 5, requireReason: false, variant: 'secondary' });
    actions.push({ label: '완료', toStatus: 6, requireReason: false, variant: 'primary' });
    actions.push({ label: '보류', toStatus: 7, requireReason: true, variant: 'secondary' });
    if (role === 'ADMIN') {
      actions.push({ label: '반려', toStatus: 8, requireReason: true, variant: 'danger' });
    }
  }

  // ── 픽업 취소 / 담당자 변경 ──────────────────────────────────
  if (status === 4) {
    const isAssignee = ticket.assigneeId != null && ticket.assigneeId === user.id;
    if (isAssignee || role === 'DEVELOPER') {
      // 본인이 픽업한 경우 → 취소
      actions.push({ label: '픽업 취소', toStatus: -1 as TicketStatus, requireReason: false, variant: 'secondary' });
    } else if (role === 'ADMIN') {
      // 관리자이지만 본인 픽업 아닌 경우 → 담당자 변경 (-2 신호)
      actions.push({ label: '담당자 변경', toStatus: -2 as TicketStatus, requireReason: false, variant: 'secondary' });
    }
  }

  // ── QA검증(5) → 처리 ─────────────────────────────────────────
  if (status === 5 && (role === 'REQUESTER' || role === 'ADMIN' || ticket.requesterId === user.id)) {
    actions.push({ label: '재검증 필요', toStatus: 4, requireReason: true, variant: 'secondary' });
    actions.push({ label: '완료 처리', toStatus: 6, requireReason: false, variant: 'primary' });
  }

  // ── 완료(6) 7일 이내 → 재오픈 ───────────────────────────────
  if (status === 6 && ticket.completedAt) {
    const completedAt = new Date(ticket.completedAt);
    const diffDays = (Date.now() - completedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays <= 7) {
      actions.push({ label: '재오픈', toStatus: 4, requireReason: true, variant: 'secondary' });
    }
  }

  // ── 보류(7) → 관리자가 재활성 ──────────────────────────────
  if (status === 7 && role === 'ADMIN') {
    actions.push({ label: '검토대기로 복귀', toStatus: 1, requireReason: false, variant: 'secondary' });
    actions.push({ label: '픽업대기로 복귀', toStatus: 3, requireReason: false, variant: 'primary' });
  }

  return actions;
};

const canEdit = (ticket: Ticket, user: User | null): boolean => {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const isRequester = ticket.requesterId === user.id;
  // 픽업 전(검토대기·진행가능) 상태에서만 수정 가능
  return isRequester && ticket.status <= 3;
};

// ─── 처리 이력 헬퍼 ──────────────────────────────────────────
const STATUS_DOT_COLOR: Record<number, string> = {
  1: '#94a3b8', 2: '#14b8a6', 3: '#6366f1', 4: '#3b82f6',
  5: '#8b5cf6', 6: '#10b981', 7: '#64748b', 8: '#ef4444',
};

const getActionInfo = (
  from: TicketStatus | undefined,
  to: TicketStatus,
): { label: string; labelCls: string } => {
  if (!from) return { label: '등록', labelCls: 'bg-gray-100 text-gray-600' };
  const key = `${from}->${to}`;
  const map: Record<string, { label: string; labelCls: string }> = {
    '1->2': { label: '검토완료',        labelCls: 'bg-teal-50 text-teal-700' },
    '1->8': { label: '반려',            labelCls: 'bg-red-50 text-red-700' },
    '2->3': { label: '픽업대기 전환',   labelCls: 'bg-indigo-50 text-indigo-700' },
    '2->8': { label: '반려',            labelCls: 'bg-red-50 text-red-700' },
    '3->4': { label: '티켓 픽업',       labelCls: 'bg-blue-50 text-blue-700' },
    '4->3': { label: '픽업 취소',       labelCls: 'bg-gray-100 text-gray-600' },
    '4->5': { label: 'QA검증 요청',     labelCls: 'bg-purple-50 text-purple-700' },
    '4->6': { label: '완료 처리',       labelCls: 'bg-green-50 text-green-700' },
    '4->7': { label: '보류',            labelCls: 'bg-gray-100 text-gray-600' },
    '4->8': { label: '반려',            labelCls: 'bg-red-50 text-red-700' },
    '5->4': { label: 'QA 재검증 요청',  labelCls: 'bg-purple-50 text-purple-700' },
    '5->6': { label: '완료 처리',       labelCls: 'bg-green-50 text-green-700' },
    '6->1': { label: '재오픈',          labelCls: 'bg-gray-100 text-gray-600' },
    '7->1': { label: '검토대기 복귀',   labelCls: 'bg-gray-100 text-gray-600' },
    '7->3': { label: '픽업대기 복귀',   labelCls: 'bg-indigo-50 text-indigo-700' },
    // 구버전 이력 호환
    '1->3': { label: '검토완료',         labelCls: 'bg-teal-50 text-teal-700' },
  };
  return map[key] ?? { label: '상태 변경', labelCls: 'bg-gray-100 text-gray-600' };
};

const EXTRA_FIELD_LABELS: Record<string, string> = {
  reproEnv:       '재현 환경',
  incidentVendor:  '장애업체',
  incidentContent: '장애내용',
  background:     '요청 배경',
  requirements:   '요구사항',
  referenceLink:  '참고 자료',
  vendorName:     '업체명',
  requestContent: '요청 내용',
  deadline:       '기한',
};

// 티켓 타입별 extra fields (buildVersion/qaFilePath는 직접 컬럼으로 승격됨)
const EXTRA_FIELD_KEYS: Record<TicketType, string[]> = {
  1: ['reproEnv'],
  2: ['incidentVendor', 'incidentContent'],
  3: ['background', 'requirements', 'referenceLink'],
  4: ['vendorName', 'requestContent', 'deadline'],
  5: ['taskContent', 'referenceLink'],
};

const EXTRA_FIELD_TEXTAREA: Record<string, boolean> = {
  incidentContent: true, background: true, requirements: true, requestContent: true,
};

// ─── 파일 경로 복사 버튼 ──────────────────────────────────────────────────────
const CopyPathButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    let success = false;
    // 1) Clipboard API (HTTPS / localhost)
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); success = true; } catch { /* fallback */ }
    }
    // 2) execCommand fallback (HTTP 환경)
    if (!success) {
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
        document.body.appendChild(el);
        el.focus(); el.select();
        success = document.execCommand('copy');
        document.body.removeChild(el);
      } catch { /* ignore */ }
    }
    if (success) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors flex-shrink-0"
      style={{
        color: copied ? 'var(--dt-primary-dark)' : 'var(--dt-text-muted)',
        background: copied ? 'var(--dt-primary-light)' : 'var(--dt-bg)',
        border: '1px solid var(--dt-border)',
      }}
    >
      {copied ? <CheckCheck size={11} /> : <Copy size={11} />}
      {copied ? '복사됨' : '복사'}
    </button>
  );
};

const VARIANT_CLASS: Record<string, string> = {
  primary:   'dt-btn dt-btn-primary',
  secondary: 'dt-btn dt-btn-secondary',
  success:   'dt-btn dt-btn-secondary',
  warning:   'dt-btn dt-btn-secondary',
  danger:    'dt-btn dt-btn-secondary',
};

const TicketDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Status change modal state
  const [modalAction, setModalAction] = useState<StatusAction | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // Admin review panel state
  const [reviewOpen, setReviewOpen]           = useState(false);
  const [reviewStatus, setReviewStatus]       = useState<number>(0);
  const [reviewDifficulty, setReviewDifficulty] = useState<number | ''>('');
  const [reviewEffort, setReviewEffort]       = useState<string>('');
  const [reviewEffortUnit, setReviewEffortUnit] = useState<'HOUR' | 'MD'>('HOUR');
  const [reviewPriority, setReviewPriority]   = useState<number | ''>('');
  const [reviewReason, setReviewReason]       = useState('');
  const [reviewLoading, setReviewLoading]     = useState(false);
  const [reviewError, setReviewError]         = useState('');

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle]             = useState('');
  const [editIsUrgent, setEditIsUrgent]       = useState(false);
  const [editProductName, setEditProductName] = useState('');
  const [editPlatform, setEditPlatform]           = useState('');
  const [editErrorBug, setEditErrorBug]           = useState('');
  const [editBuildVersion, setEditBuildVersion]   = useState('');
  const [editQaFilePath, setEditQaFilePath]       = useState('');
  const [editExtraFields, setEditExtraFields] = useState<Record<string, string>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 담당자 지정 state (관리자 전용)
  const [assignOpen, setAssignOpen]           = useState(false);
  const [developers, setDevelopers]           = useState<Developer[]>([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<number | ''>('');
  const [assignLoading, setAssignLoading]     = useState(false);
  const [assignError, setAssignError]         = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([getTicket(Number(id)), getMe()])
      .then(([t, u]) => { setTicket(t); setUser(u); })
      .catch(() => setError('티켓을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [id]);

  // Escape 키로 모달 닫기
  useEffect(() => {
    if (!modalAction) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !actionLoading) setModalAction(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [modalAction, actionLoading]);

  const openEditMode = () => {
    if (!ticket) return;
    setEditTitle(ticket.title);
    setEditIsUrgent(ticket.isUrgent);
    setEditProductName(ticket.productName ?? '');
    setEditPlatform(ticket.platform ?? '');
    setEditErrorBug(ticket.errorBug ?? '');
    setEditBuildVersion(ticket.buildVersion ?? '');
    setEditQaFilePath(ticket.qaFilePath ?? '');
    const extra: Record<string, string> = {};
    const keys = EXTRA_FIELD_KEYS[ticket.ticketType as TicketType] ?? [];
    keys.forEach((k) => {
      extra[k] = String((ticket.extraFields as Record<string, unknown>)?.[k] ?? '');
    });
    setEditExtraFields(extra);
    setEditError('');
    setEditMode(true);
  };

  const handleEditSubmit = async () => {
    if (!ticket) return;
    if (!editTitle.trim()) { setEditError('제목을 입력해주세요.'); return; }
    setEditLoading(true);
    setEditError('');
    try {
      const extraFields: Record<string, unknown> = {};
      Object.entries(editExtraFields).forEach(([k, v]) => { if (v.trim()) extraFields[k] = v.trim(); });
      const updated = await updateTicket(ticket.id, {
        title: editTitle.trim(),
        isUrgent: editIsUrgent,
        productName: editProductName || null,
        platform: editPlatform || undefined,
        errorBug: editErrorBug.trim() || null,
        buildVersion: editBuildVersion.trim() || null,
        qaFilePath: editQaFilePath.trim() || null,
        extraFields,
      });
      setTicket(updated);
      setEditMode(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '수정에 실패했습니다.');
    } finally {
      setEditLoading(false);
    }
  };

  const openReviewPanel = () => {
    if (!ticket) return;
    setReviewStatus(0);
    setReviewDifficulty(ticket.difficulty ?? '');
    setReviewEffort(ticket.expectedEffort != null ? String(ticket.expectedEffort) : '');
    setReviewEffortUnit((ticket.effortUnit as 'HOUR' | 'MD') ?? 'HOUR');
    setReviewPriority(ticket.priority ?? '');
    setReviewReason('');
    setReviewError('');
    setReviewOpen(true);
  };

  const handleReviewSubmit = async () => {
    if (!ticket) return;
    if (reviewStatus === 0) {
      setReviewError('검토 결과를 선택해주세요.');
      return;
    }
    if (reviewStatus === 8 && !reviewReason.trim()) {
      setReviewError('반려 시 사유를 입력해주세요.');
      return;
    }
    setReviewLoading(true);
    setReviewError('');
    try {
      const updated = await adminReview(ticket.id, {
        status: reviewStatus,
        reason: reviewReason.trim() || undefined,
        difficulty: reviewDifficulty !== '' ? Number(reviewDifficulty) : undefined,
        expectedEffort: reviewEffort !== '' ? Number(reviewEffort) : undefined,
        effortUnit: reviewEffort !== '' ? reviewEffortUnit : undefined,
        priority: reviewPriority !== '' ? Number(reviewPriority) : undefined,
      });
      setTicket(updated);
      setReviewOpen(false);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; detail?: string } } };
      const serverMsg = axiosErr?.response?.data?.message || axiosErr?.response?.data?.detail;
      if (serverMsg) {
        setReviewError(serverMsg);
      } else if (err instanceof Error) {
        setReviewError('검토 처리 중 오류가 발생했습니다.');
      } else {
        setReviewError('검토 처리 중 오류가 발생했습니다.');
      }
    } finally {
      setReviewLoading(false);
    }
  };

  const handlePickup = async () => {
    if (!ticket) return;
    setActionLoading(true);
    try {
      const updated = await pickupTicket(ticket.id);
      setTicket(updated);
    } catch {
      setActionError('픽업 처리 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelPickup = async () => {
    if (!ticket) return;
    setActionLoading(true);
    try {
      const updated = await cancelPickup(ticket.id);
      setTicket(updated);
    } catch {
      setActionError('픽업 취소 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  const openAssignPanel = async () => {
    setSelectedAssigneeId(ticket?.assigneeId ?? '');
    setAssignError('');
    if (developers.length === 0) {
      const devs = await getDevelopers().catch(() => []);
      setDevelopers(devs);
    }
    setAssignOpen(true);
  };

  const handleAssignSubmit = async () => {
    if (!ticket || selectedAssigneeId === '') { setAssignError('담당자를 선택해주세요.'); return; }
    setAssignLoading(true);
    setAssignError('');
    try {
      const updated = await assignTicket(ticket.id, Number(selectedAssigneeId));
      setTicket(updated);
      setAssignOpen(false);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setAssignError(axiosErr?.response?.data?.message ?? '담당자 지정에 실패했습니다.');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleActionClick = (action: StatusAction) => {
    // 픽업 (진행가능→진행중)
    if (action.toStatus === 4 && ticket?.status === 3) {
      handlePickup();
      return;
    }
    // 픽업 취소
    if ((action.toStatus as number) === -1) {
      handleCancelPickup();
      return;
    }
    // 담당자 변경
    if ((action.toStatus as number) === -2) {
      openAssignPanel();
      return;
    }
    setModalAction(action);
    setReason('');
    setActionError('');
  };

  const handleModalConfirm = async () => {
    if (!ticket || !modalAction) return;
    if (modalAction.requireReason && !reason.trim()) {
      setActionError('사유를 입력해주세요.');
      return;
    }
    setActionLoading(true);
    try {
      const updated = await changeStatus(ticket.id, {
        toStatus: modalAction.toStatus,
        reason: reason.trim() || undefined,
      });
      setTicket(updated);
      setModalAction(null);
    } catch {
      setActionError('상태 변경 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="dt-page flex items-center justify-center">
        <svg className="animate-spin w-6 h-6 text-[var(--dt-primary)]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="dt-page">
        <div className="dt-card p-8 text-center text-gray-500">{error || '티켓을 찾을 수 없습니다.'}</div>
      </div>
    );
  }

  const actions = getStatusActions(ticket, user);
  const extraFields = ticket.extraFields ?? {};
  const extraFieldKeys = EXTRA_FIELD_KEYS[ticket.ticketType as TicketType] ?? [];
  const editable = canEdit(ticket, user);
  const hasBuildInfo = !!(ticket.errorBug || ticket.buildVersion || ticket.qaFilePath);
  const hasReview = ticket.difficulty != null || ticket.priority != null || ticket.expectedEffort != null || !!ticket.desiredDueDate || !!ticket.requestedDueDate || !!ticket.requestingDept;

  return (
    <div className="dt-page">

      {/* ── 삭제 확인 모달 ── */}
      {confirmDelete && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(false); }}
        >
          <div style={{
            background: '#fff', borderRadius: 16, padding: '28px 28px 24px',
            width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            {/* 아이콘 + 제목 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>티켓을 삭제하시겠습니까?</p>
                <p style={{ fontSize: 13, color: '#6b7280', marginTop: 6, lineHeight: 1.5 }}>
                  삭제된 티켓은 복구할 수 없습니다.<br />
                  <span style={{ fontWeight: 600, color: '#374151' }}>{ticket?.ticketNo}</span> 티켓이 영구 삭제됩니다.
                </p>
              </div>
            </div>

            {/* 버튼 */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="dt-btn dt-btn-secondary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setConfirmDelete(false)}
                disabled={deleteLoading}
              >
                취소
              </button>
              <button
                className="dt-btn"
                style={{ flex: 1, justifyContent: 'center', background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
                disabled={deleteLoading}
                onClick={async () => {
                  setDeleteLoading(true);
                  try { await deleteTicket(ticket!.id); navigate('/board'); }
                  catch { setDeleteLoading(false); setConfirmDelete(false); }
                }}
              >
                {deleteLoading ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="dt-page-header">
        <button className="flex items-center gap-1 text-sm text-[var(--dt-primary)] hover:text-[var(--dt-primary-dark)]" onClick={() => navigate('/board')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          목록으로
        </button>
        <div className="flex items-center gap-2">
          {/* 관리자 검토 버튼 (검토대기/검토완료 상태) */}
          {user?.role === 'ADMIN' && (ticket.status === 1 || ticket.status === 2) && !editMode && (
            <button className="dt-btn dt-btn-primary text-sm" onClick={openReviewPanel}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline mr-1">
                <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              검토하기
            </button>
          )}
          {editable && !editMode && (
            <button className="dt-btn dt-btn-secondary text-sm" onClick={openEditMode}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline mr-1">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              수정
            </button>
          )}
          {user?.role === 'ADMIN' && !editMode && (
            <button
              className="dt-btn dt-btn-secondary text-sm"
              style={{ color: '#dc2626', borderColor: '#fca5a5' }}
              onClick={() => setConfirmDelete(true)}
            >
              삭제
            </button>
          )}
        </div>
      </div>

      {/* ── 수정 모드 ── */}
      {editMode ? (
        <div className="space-y-5">
          {/* 기본 정보 수정 */}
          <div className="dt-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h2 className="text-sm font-semibold text-gray-700">기본 정보 수정</h2>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{ticket.ticketNo}</span>
                <TypeBadge type={ticket.ticketType} showLabel />
              </div>
            </div>
            <div>
              <label className="dt-label flex items-center justify-between">
                <span>제목 <span className="text-red-500">*</span></span>
                <span className={`text-xs font-normal ${editTitle.length > 180 ? 'text-rose-500' : 'text-gray-400'}`}>
                  {editTitle.length}/200
                </span>
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={200}
                className="dt-input w-full"
                placeholder="티켓 제목을 입력하세요"
              />
            </div>
            {/* 제품명 + 플랫폼 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="dt-label">제품명</label>
                <select
                  value={editProductName}
                  onChange={(e) => setEditProductName(e.target.value)}
                  className="dt-select w-full"
                >
                  <option value="">-- 선택 안 함 --</option>
                  {PRODUCT_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="dt-label">플랫폼</label>
                <select
                  value={editPlatform}
                  onChange={(e) => setEditPlatform(e.target.value)}
                  className="dt-select w-full"
                >
                  <option value="">-- 플랫폼 선택 --</option>
                  {PLATFORM_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            {/* Error/Bug */}
            <div>
              <label className="dt-label">Error / Bug</label>
              <input
                type="text"
                value={editErrorBug}
                onChange={(e) => setEditErrorBug(e.target.value)}
                placeholder="예: NullPointerException, ERR_AUTH_TIMEOUT"
                className="dt-input w-full"
              />
            </div>
            {/* 빌드버전 + QA 파일경로 — QA 오류 타입일 때만 */}
            {ticket.ticketType === 1 && (
              <>
                <div>
                  <label className="dt-label">빌드/버전 번호</label>
                  <input
                    type="text"
                    value={editBuildVersion}
                    onChange={(e) => setEditBuildVersion(e.target.value)}
                    placeholder="예: v1.2.3 / build-203"
                    className="dt-input w-full"
                  />
                </div>
                <div>
                  <label className="dt-label">QA 파일 경로</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editQaFilePath}
                      onChange={(e) => setEditQaFilePath(e.target.value)}
                      placeholder="/QA/2026/05/build_203/error_log.zip"
                      className="dt-input flex-1 font-mono text-sm"
                    />
                    <CopyPathButton text={editQaFilePath} />
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editIsUrgent}
                  onChange={(e) => setEditIsUrgent(e.target.checked)}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm font-medium text-gray-700">긴급 처리 요청</span>
              </label>
            </div>
          </div>

          {/* 상세 정보 수정 */}
          {extraFieldKeys.length > 0 && (
            <div className="dt-card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">
                {TICKET_TYPE_LABEL[ticket.ticketType as TicketType]} 상세 정보 수정
              </h2>
              {extraFieldKeys.map((key) => (
                <div key={key}>
                  <label className="dt-label">{EXTRA_FIELD_LABELS[key] ?? key}</label>
                  {EXTRA_FIELD_TEXTAREA[key] ? (
                    <textarea
                      value={editExtraFields[key] ?? ''}
                      onChange={(e) => setEditExtraFields((f) => ({ ...f, [key]: e.target.value }))}
                      rows={3}
                      className="dt-textarea w-full"
                    />
                  ) : (
                    <input
                      type={key === 'deadline' ? 'date' : key === 'referenceLink' ? 'url' : 'text'}
                      value={editExtraFields[key] ?? ''}
                      onChange={(e) => setEditExtraFields((f) => ({ ...f, [key]: e.target.value }))}
                      className="dt-input w-full"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {editError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{editError}</p>
          )}

          <div className="flex gap-3">
            <button
              className="dt-btn dt-btn-primary"
              onClick={handleEditSubmit}
              disabled={editLoading}
            >
              {editLoading ? '저장 중...' : '저장'}
            </button>
            <button
              className="dt-btn dt-btn-secondary"
              onClick={() => setEditMode(false)}
              disabled={editLoading}
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        /* ── 보기 모드 ── */
        <>
          {/* ① 티켓 헤더 (번호 · 상태 · 타입 · 제목 + 액션 버튼) */}
          <div className="dt-card p-6">
            <div className="flex items-start justify-between gap-4">
              {/* 왼쪽: 배지 + 제목 */}
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{ticket.ticketNo}</span>
                  <StatusBadge status={ticket.status} />
                  <TypeBadge type={ticket.ticketType} showLabel />
                  {ticket.isUrgent && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-500">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0">
                        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                      </svg>
                      긴급
                    </span>
                  )}
                </div>
                <h1 className="text-xl font-bold text-gray-900">{ticket.title}</h1>
              </div>
              {/* 오른쪽: 상태 전이 액션 버튼 */}
              {actions.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap flex-shrink-0 pt-0.5">
                  {actions.map((action) => (
                    <button
                      key={action.label}
                      className={VARIANT_CLASS[action.variant]}
                      style={action.variant === 'danger' ? { color: '#dc2626', borderColor: '#fca5a5' } : undefined}
                      onClick={() => handleActionClick(action)}
                      disabled={actionLoading}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ② 워크플로우 스텝 인디케이터 */}
          {(() => {
            const MAIN_STEPS: { status: TicketStatus; label: string }[] = [
              { status: 1, label: '검토대기' },
              { status: 2, label: '검토완료' },
              { status: 3, label: '픽업대기' },
              { status: 4, label: '진행중' },
              { status: 5, label: 'QA검증' },
              { status: 6, label: '완료' },
            ];
            const isSpecial = ticket.status === 7 || ticket.status === 8;
            const currentIdx = MAIN_STEPS.findIndex(s => s.status === ticket.status);
            return (
              <div className="dt-card px-5 py-4" style={{ background: isSpecial ? 'rgba(100,116,139,0.04)' : undefined }}>
                {isSpecial && (
                  <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-sm font-semibold ${ticket.status === 8 ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                    {ticket.status === 8
                      ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4.5 4.5l15 15M19.5 4.5l-15 15"/></svg>반려된 티켓입니다.</>
                      : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>보류 중인 티켓입니다.</>
                    }
                  </div>
                )}
                <div style={{ display: 'flex', width: '100%' }}>
                  {MAIN_STEPS.map((step, idx) => {
                    const isDone   = !isSpecial && currentIdx > idx;
                    const isActive = !isSpecial && currentIdx === idx;
                    const dotBg     = isDone ? '#c9a879' : isActive ? '#fff' : '#f5f4f1';
                    const dotBorder = isDone ? '#c9a879' : isActive ? '#a07040' : '#e5e2db';
                    const dotColor  = isDone ? '#fff' : isActive ? '#a07040' : '#b0a090';
                    const leftLineBg  = (!isSpecial && currentIdx >= idx) ? '#c9a879' : '#e5e2db';
                    const rightLineBg = (!isSpecial && currentIdx > idx)  ? '#c9a879' : '#e5e2db';
                    const labelColor  = isDone ? '#a07040' : isActive ? '#1a1a1a' : '#b0a090';
                    const labelWeight = isActive ? '700' : isDone ? '600' : '400';
                    return (
                      <div key={step.status} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                        {/* 왼쪽 연결선 (첫 스텝 제외) */}
                        {idx > 0 && (
                          <div style={{ position: 'absolute', top: 13, left: 0, width: '50%', height: 2, background: leftLineBg }} />
                        )}
                        {/* 오른쪽 연결선 (마지막 스텝 제외) */}
                        {idx < MAIN_STEPS.length - 1 && (
                          <div style={{ position: 'absolute', top: 13, right: 0, width: '50%', height: 2, background: rightLineBg }} />
                        )}
                        {/* 점 */}
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: dotBg, border: `2px solid ${dotBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: isActive ? '0 0 0 4px rgba(160,112,64,0.15)' : undefined, flexShrink: 0, position: 'relative', zIndex: 1 }}>
                          {isDone
                            ? <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8.5 6.2 12l6.8-7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            : <span style={{ fontSize: 11, fontWeight: 700, color: dotColor }}>{idx + 1}</span>
                          }
                        </div>
                        {/* 라벨 */}
                        <span style={{ fontSize: 12, color: labelColor, fontWeight: labelWeight, marginTop: 6, whiteSpace: 'nowrap', textAlign: 'center' }}>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ③ 2열 정보 카드 그리드 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

            {/* 카드 1: 기본 정보 */}
            <div className="dt-card overflow-hidden" style={{ gridColumn: hasBuildInfo ? undefined : '1 / -1' }}>
              <div className="flex items-center gap-1.5 px-5 py-3 border-b border-gray-100">
                <h2 className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                  기본 정보
                </h2>
              </div>
              <div className="px-5 pb-2">
                <div className="flex items-start py-2 border-b border-gray-50">
                  <dt className="text-xs text-gray-400 leading-relaxed" style={{ width: 100, flexShrink: 0, paddingTop: 1 }}>요청자</dt>
                  <dd className="text-[13px] font-medium text-gray-900 flex-1 leading-relaxed">{ticket.requesterName}</dd>
                </div>
                <div className="flex items-start py-2 border-b border-gray-50">
                  <dt className="text-xs text-gray-400 leading-relaxed" style={{ width: 100, flexShrink: 0, paddingTop: 1 }}>담당자</dt>
                  <dd className="text-[13px] font-medium flex-1 leading-relaxed flex items-center gap-2">
                    {ticket.assigneeName
                      ? <span className="text-gray-900">{ticket.assigneeName}</span>
                      : <span className="text-gray-400">미배정</span>}
                    {user?.role === 'ADMIN' && (ticket.status === 3 || ticket.status === 4) && (
                      <button
                        type="button"
                        onClick={openAssignPanel}
                        className="text-[11px] px-2 py-0.5 rounded border font-medium transition-colors"
                        style={{ color: 'var(--dt-primary)', borderColor: 'var(--dt-primary)', background: 'var(--dt-primary-light)' }}
                      >
                        {ticket.assigneeName ? '변경' : '지정'}
                      </button>
                    )}
                  </dd>
                </div>
                {ticket.productName && (
                  <div className="flex items-start py-2 border-b border-gray-50">
                    <dt className="text-xs text-gray-400 leading-relaxed" style={{ width: 100, flexShrink: 0, paddingTop: 1 }}>제품명</dt>
                    <dd className="text-[13px] font-medium text-gray-900 flex-1 leading-relaxed">{ticket.productName}</dd>
                  </div>
                )}
                {ticket.platform && (
                  <div className="flex items-start py-2">
                    <dt className="text-xs text-gray-400 leading-relaxed" style={{ width: 100, flexShrink: 0, paddingTop: 1 }}>플랫폼</dt>
                    <dd className="flex-1 leading-relaxed">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600">{ticket.platform}</span>
                    </dd>
                  </div>
                )}
              </div>
            </div>

            {/* 카드 2: 빌드 정보 */}
            {hasBuildInfo && (
              <div className="dt-card overflow-hidden">
                <div className="flex items-center gap-1.5 px-5 py-3 border-b border-gray-100">
                  <h2 className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                    빌드 정보
                  </h2>
                </div>
                <div className="px-5 pb-2">
                  {ticket.errorBug && (
                    <div className="flex items-start py-2 border-b border-gray-50">
                      <dt className="text-xs text-gray-400 leading-relaxed" style={{ width: 100, flexShrink: 0, paddingTop: 1 }}>Error / Bug</dt>
                      <dd className="text-[13px] font-mono font-bold text-gray-900 flex-1 leading-relaxed">{ticket.errorBug}</dd>
                    </div>
                  )}
                  {ticket.buildVersion && (
                    <div className={`flex items-start py-2 ${ticket.qaFilePath ? 'border-b border-gray-50' : ''}`}>
                      <dt className="text-xs text-gray-400 leading-relaxed" style={{ width: 100, flexShrink: 0, paddingTop: 1 }}>빌드 버전</dt>
                      <dd className="text-[13px] font-mono font-medium text-gray-900 flex-1 leading-relaxed">{ticket.buildVersion}</dd>
                    </div>
                  )}
                  {ticket.qaFilePath && (
                    <div className="py-3">
                      <p className="text-xs text-gray-400 mb-1.5">QA 파일 경로</p>
                      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                        <span className="text-sm font-mono text-gray-700 flex-1 break-all">{ticket.qaFilePath}</span>
                        <CopyPathButton text={ticket.qaFilePath} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 카드: 첨부파일 */}
            {ticket.attachmentPath && (
              <div className="dt-card overflow-hidden">
                <div className="flex items-center gap-1.5 px-5 py-3 border-b border-gray-100">
                  <h2 className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    첨부파일
                  </h2>
                </div>
                <div className="px-5 py-4">
                  <a
                    href={`/devticket/api/v1/attachments/${ticket.attachmentPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors hover:bg-gray-50"
                    style={{ borderColor: 'var(--dt-border)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--dt-primary)', flexShrink: 0 }}>
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                    <span className="text-sm text-gray-700 flex-1 truncate">
                      {ticket.attachmentPath.replace(/^[a-f0-9]{32}_/, '')}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--dt-text-muted)', flexShrink: 0 }}>
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                </div>
              </div>
            )}

            {/* 카드 3: 개발 검토 */}
            {hasReview && (
              <div className="dt-card overflow-hidden" style={{ background: 'linear-gradient(135deg, #fdf9f4, #f9f5ef)', border: '1px solid #e8dfd4' }}>
                <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #e8dfd4' }}>
                  <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: '#7a5c3a' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    개발 검토
                  </h2>
                  {ticket.reviewedByName && (
                    <span className="text-[11px] text-gray-400">
                      {ticket.reviewedByName}{ticket.reviewedAt && ` · ${formatDate(ticket.reviewedAt)}`}
                    </span>
                  )}
                </div>
                <div className="px-5 pb-2">
                  {ticket.difficulty != null && (
                    <div className="flex items-start py-2" style={{ borderBottom: '1px solid #f0e8dd' }}>
                      <dt className="text-xs leading-relaxed" style={{ width: 100, flexShrink: 0, paddingTop: 1, color: '#a09080' }}>난이도</dt>
                      <dd className="text-[13px] font-medium text-gray-900 flex-1 leading-relaxed">{DIFFICULTY_LABEL[ticket.difficulty] ?? '-'}</dd>
                    </div>
                  )}
                  {ticket.priority != null && (
                    <div className="flex items-start py-2" style={{ borderBottom: '1px solid #f0e8dd' }}>
                      <dt className="text-xs leading-relaxed" style={{ width: 100, flexShrink: 0, paddingTop: 1, color: '#a09080' }}>우선순위</dt>
                      <dd className="text-[13px] font-medium text-gray-900 flex-1 leading-relaxed">{PRIORITY_LABEL[ticket.priority] ?? '-'}</dd>
                    </div>
                  )}
                  {ticket.expectedEffort != null && (
                    <div className="flex items-start py-2" style={{ borderBottom: ticket.desiredDueDate || ticket.requestingDept ? '1px solid #f0e8dd' : 'none' }}>
                      <dt className="text-xs leading-relaxed" style={{ width: 100, flexShrink: 0, paddingTop: 1, color: '#a09080' }}>예상 공수</dt>
                      <dd className="text-[13px] font-medium text-gray-900 flex-1 leading-relaxed">{ticket.expectedEffort}{ticket.effortUnit === 'MD' ? ' MD' : 'h'}</dd>
                    </div>
                  )}
                  {ticket.requestedDueDate && (
                    <div className="flex items-start py-2" style={{ borderBottom: (ticket.desiredDueDate || ticket.requestingDept) ? '1px solid #f0e8dd' : 'none' }}>
                      <dt className="text-xs leading-relaxed" style={{ width: 100, flexShrink: 0, paddingTop: 1, color: '#a09080' }}>요청자 희망일</dt>
                      <dd className="text-[13px] text-gray-500 flex-1 leading-relaxed">{ticket.requestedDueDate}</dd>
                    </div>
                  )}
                  {ticket.desiredDueDate && (
                    <div className="flex items-start py-2" style={{ borderBottom: ticket.requestingDept ? '1px solid #f0e8dd' : 'none' }}>
                      <dt className="text-xs leading-relaxed" style={{ width: 100, flexShrink: 0, paddingTop: 1, color: '#a09080' }}>확정 완료일</dt>
                      <dd className="text-[13px] font-medium text-gray-900 flex-1 leading-relaxed">{ticket.desiredDueDate}</dd>
                    </div>
                  )}
                  {ticket.requestingDept && (
                    <div className="flex items-start py-2">
                      <dt className="text-xs leading-relaxed" style={{ width: 100, flexShrink: 0, paddingTop: 1, color: '#a09080' }}>요청 부서</dt>
                      <dd className="text-[13px] font-medium text-gray-900 flex-1 leading-relaxed">{ticket.requestingDept}</dd>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 카드 4: 일정 및 이력 */}
            <div className="dt-card overflow-hidden" style={{ gridColumn: hasReview ? undefined : '1 / -1' }}>
              <div className="flex items-center gap-1.5 px-5 py-3 border-b border-gray-100">
                <h2 className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  일정 및 이력
                </h2>
              </div>
              <div className="px-5 pb-2">
                <div className="flex items-start py-2 border-b border-gray-50">
                  <dt className="text-xs text-gray-400 leading-relaxed" style={{ width: 100, flexShrink: 0, paddingTop: 1 }}>등록일</dt>
                  <dd className="text-[13px] font-medium text-gray-900 flex-1 leading-relaxed">{formatDate(ticket.createdAt)}</dd>
                </div>
                <div className="flex items-start py-2 border-b border-gray-50">
                  <dt className="text-xs text-gray-400 leading-relaxed" style={{ width: 100, flexShrink: 0, paddingTop: 1 }}>최종 수정</dt>
                  <dd className="text-[13px] font-medium text-gray-900 flex-1 leading-relaxed">{formatDate(ticket.updatedAt)}</dd>
                </div>
                <div className="flex items-start py-2">
                  <dt className="text-xs text-gray-400 leading-relaxed" style={{ width: 100, flexShrink: 0, paddingTop: 1 }}>등록자</dt>
                  <dd className="text-[13px] font-medium text-gray-900 flex-1 leading-relaxed">{ticket.requesterName}</dd>
                </div>
              </div>
            </div>

          </div>{/* /2열 그리드 */}


          {/* ⑤ 타입별 상세 정보 */}
          {Object.keys(extraFields).length > 0 && (
            <div className="dt-card overflow-hidden">
              <div className="flex items-center gap-1.5 px-5 py-3 border-b border-gray-100">
                <h2 className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  {TICKET_TYPE_LABEL[ticket.ticketType as TicketType]} 상세
                </h2>
              </div>
              <div className="px-5 pb-3">
                {extraFieldKeys.filter((key) => extraFields[key]).map((key) => {
                  const value = String(extraFields[key]);
                  return (
                    <div key={key} className="flex flex-col gap-1 py-2 border-b border-gray-50 last:border-b-0">
                      <dt className="text-xs font-medium text-gray-400">{EXTRA_FIELD_LABELS[key] ?? key}</dt>
                      <dd className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{value}</dd>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ⑥ 댓글 */}
          <CommentSection ticketId={ticket.id} currentUser={user} />

          {/* ⑦ 처리 이력 */}
          <div className="dt-card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-5">처리 이력</h2>
            {ticket.historyList.length === 0 ? (
              <p className="text-sm text-gray-400">이력이 없습니다.</p>
            ) : (
              <ol className="space-y-0">
                {ticket.historyList.map((h, idx) => {
                  const { label, labelCls } = getActionInfo(h.fromStatus, h.toStatus);
                  const dotColor = STATUS_DOT_COLOR[h.toStatus] ?? '#94a3b8';
                  const isLast = idx === ticket.historyList.length - 1;
                  return (
                    <li key={h.id} className="flex gap-4">
                      <div className="flex flex-col items-center flex-shrink-0 pt-0.5">
                        <span className="w-3 h-3 rounded-full border-2 border-white shadow flex-shrink-0" style={{ backgroundColor: dotColor, outline: `2px solid ${dotColor}20` }} />
                        {!isLast && <span className="w-px flex-1 bg-gray-200 mt-1 mb-1" style={{ minHeight: '20px' }} />}
                      </div>
                      <div className="pb-5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${labelCls}`}>{label}</span>
                          <span className="text-xs font-medium text-gray-700">{h.changedByName}</span>
                          <span className="text-xs text-gray-400">{formatDate(h.changedAt)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          {h.fromStatus ? (
                            <>
                              <StatusBadge status={h.fromStatus} />
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300 flex-shrink-0">
                                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                              </svg>
                              <StatusBadge status={h.toStatus} />
                            </>
                          ) : (
                            <StatusBadge status={h.toStatus} />
                          )}
                        </div>
                        {h.reason && (
                          <div className="mt-2 flex items-start gap-1.5 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 flex-shrink-0 mt-0.5">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{highlightMentions(h.reason)}</p>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </>
      )}

      {/* Status change modal */}
      {modalAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              상태 변경: <span className="text-[var(--dt-primary)]">{TICKET_STATUS_LABEL[modalAction.toStatus]}</span>
            </h3>
            <div className="space-y-3">
              <label className="dt-label">
                사유 {modalAction.requireReason && <span className="text-red-500">*</span>}
              </label>
              <MentionInput
                value={reason}
                onChange={setReason}
                placeholder={modalAction.requireReason ? '사유를 입력하세요. (@username으로 멘션 가능)' : '사유 입력 (선택, @username 멘션 가능)'}
                rows={3}
              />
              {actionError && (
                <p className="text-sm text-red-600">{actionError}</p>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                className={VARIANT_CLASS[modalAction.variant]}
                onClick={handleModalConfirm}
                disabled={actionLoading}
              >
                {actionLoading ? '처리 중...' : '확인'}
              </button>
              <button
                className="dt-btn dt-btn-secondary"
                onClick={() => setModalAction(null)}
                disabled={actionLoading}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── 관리자 검토 모달 ── */}
      {reviewOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">티켓 검토</h3>
            <p className="text-xs text-gray-400 mb-5">
              검토 완료 처리 또는 반려할 수 있습니다.
            </p>

            {/* 상태 선택 */}
            <label className="dt-label mb-1">검토 결과 <span className="text-red-500">*</span></label>
            <div className="flex gap-2 mb-4">
              {(ticket.status === 1
                ? [{ v: 2, label: '검토완료' }, { v: 8, label: '반려' }]
                : [{ v: 3, label: '픽업대기 전환' }, { v: 8, label: '반려' }]
              ).map(({ v, label }) => (
                <button key={v}
                  onClick={() => setReviewStatus(v)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    reviewStatus === v
                      ? v === 8 ? 'bg-red-500 text-white border-red-500' : 'bg-[var(--dt-primary)] text-white border-[var(--dt-primary)]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >{label}</button>
              ))}
            </div>

            {/* 평가 항목 (반려 아닐 때) */}
            {reviewStatus !== 8 && (
              <div className="space-y-4 mb-4">
                {/* 난이도 */}
                <div>
                  <label className="dt-label mb-1.5">난이도</label>
                  <div className="flex gap-2">
                    {([1, 2, 3] as const).map((v) => {
                      const colors: Record<number, string> = { 1: 'border-green-400 bg-green-50 text-green-700', 2: 'border-amber-400 bg-amber-50 text-amber-700', 3: 'border-red-400 bg-red-50 text-red-700' };
                      const labels: Record<number, string> = { 1: '하', 2: '중', 3: '상' };
                      const isSelected = reviewDifficulty === v;
                      return (
                        <button key={v} type="button"
                          onClick={() => setReviewDifficulty(isSelected ? '' : v)}
                          className={`flex-1 py-2 rounded-lg border-2 text-sm font-bold transition-all ${isSelected ? colors[v] : 'border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300'}`}
                        >{labels[v]}</button>
                      );
                    })}
                  </div>
                </div>
                {/* 우선순위 */}
                <div>
                  <label className="dt-label mb-1.5">우선순위</label>
                  <div className="flex gap-2">
                    {([1, 2, 3, 4] as const).map((v) => {
                      const colors: Record<number, string> = { 1: 'border-gray-400 bg-gray-100 text-gray-600', 2: 'border-blue-400 bg-blue-50 text-blue-700', 3: 'border-orange-400 bg-orange-50 text-orange-700', 4: 'border-red-400 bg-red-50 text-red-700' };
                      const labels: Record<number, string> = { 1: '낮음', 2: '보통', 3: '높음', 4: '긴급' };
                      const isSelected = reviewPriority === v;
                      return (
                        <button key={v} type="button"
                          onClick={() => setReviewPriority(isSelected ? '' : v)}
                          className={`flex-1 py-2 rounded-lg border-2 text-sm font-bold transition-all ${isSelected ? colors[v] : 'border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300'}`}
                        >{labels[v]}</button>
                      );
                    })}
                  </div>
                </div>
                {/* 예상 공수 */}
                <div>
                  <label className="dt-label mb-1.5">예상 공수</label>
                  <div className="flex gap-2">
                    <input type="number" min="0" step="0.5" value={reviewEffort}
                      onChange={e => setReviewEffort(e.target.value)}
                      placeholder="숫자 입력" className="dt-input flex-1" />
                    <div className="flex rounded-lg overflow-hidden border border-gray-200">
                      {(['HOUR', 'MD'] as const).map((u) => (
                        <button key={u} type="button"
                          onClick={() => setReviewEffortUnit(u)}
                          className={`px-4 py-2 text-sm font-semibold transition-colors ${reviewEffortUnit === u ? 'bg-[var(--dt-primary)] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                        >{u === 'HOUR' ? 'h' : 'MD'}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 사유 */}
            <label className="dt-label mb-1">
              사유 {reviewStatus === 8 && <span className="text-red-500">*</span>}
            </label>
            <textarea value={reviewReason} onChange={e => setReviewReason(e.target.value)}
              rows={3} placeholder={reviewStatus === 8 ? '반려 사유를 입력해주세요.' : '검토 의견 (선택)'}
              className="dt-textarea w-full mb-3" />
            {reviewError && <p className="text-sm text-red-600 mb-3">{reviewError}</p>}

            <div className="flex gap-2">
              <button className={`dt-btn ${reviewStatus === 8 ? 'bg-red-500 hover:bg-red-600 text-white border-red-500' : 'dt-btn-primary'}`}
                onClick={handleReviewSubmit} disabled={reviewLoading}>
                {reviewLoading ? '처리 중...' : '검토 완료'}
              </button>
              <button className="dt-btn dt-btn-secondary" onClick={() => setReviewOpen(false)} disabled={reviewLoading}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 관리자 담당자 지정 모달 ── */}
      {assignOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">담당자 지정</h3>
            <p className="text-xs text-gray-400 mb-4">
              {ticket?.status === 3 ? '픽업대기 → 진행중으로 전환되며 담당자가 배정됩니다.' : '현재 담당자를 교체합니다.'}
            </p>

            <label className="dt-label mb-1.5">담당자 <span className="text-red-500">*</span></label>
            <select
              className="dt-input w-full mb-4"
              value={selectedAssigneeId}
              onChange={(e) => setSelectedAssigneeId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">선택하세요</option>
              {developers.map((d) => (
                <option key={d.userId} value={d.userId}>
                  {d.displayName} ({d.groupName ?? d.username})
                </option>
              ))}
            </select>

            {assignError && <p className="text-sm text-red-600 mb-3">{assignError}</p>}

            <div className="flex gap-2">
              <button className="dt-btn dt-btn-primary" onClick={handleAssignSubmit} disabled={assignLoading}>
                {assignLoading ? '처리 중...' : '지정'}
              </button>
              <button className="dt-btn dt-btn-secondary" onClick={() => setAssignOpen(false)} disabled={assignLoading}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketDetailPage;

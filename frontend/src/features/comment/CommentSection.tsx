import { useState, useEffect, useCallback, Component, type ReactNode } from 'react';
import { getComments, addComment, updateComment, deleteComment, type CommentItem } from './commentApi';
import MarkdownEditor from '@/components/editor/MarkdownEditor';
import MarkdownPreview from '@/components/editor/MarkdownPreview';
import type { User } from '@/types/auth';

/** 댓글 본문 렌더링 크래시 방지용 Error Boundary */
class CommentBodyBoundary extends Component<{ content: string }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="px-3 py-3 text-sm text-gray-700 whitespace-pre-wrap">
          {this.props.content}
        </div>
      );
    }
    return <MarkdownPreview value={this.props.content} minHeight={0} />;
  }
}

interface Props {
  ticketId: number;
  currentUser: User | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}일 전`;
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

/** 이름에서 아바타 이니셜 생성 */
function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  if (/[가-힣]/.test(trimmed)) return trimmed.slice(-2);
  const parts = trimmed.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-green-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500',
];
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const CommentSection = ({ ticketId, currentUser }: Props) => {
  const [comments, setComments]     = useState<CommentItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [content, setContent]       = useState('');
  const [isPreview, setIsPreview]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError]           = useState('');

  // 수정 상태
  const [editingId, setEditingId]         = useState<number | null>(null);
  const [editContent, setEditContent]     = useState('');
  const [editPreview, setEditPreview]     = useState(false);
  const [editSaving, setEditSaving]       = useState(false);
  const [editError, setEditError]         = useState('');

  const fetchComments = useCallback(async () => {
    try {
      const data = await getComments(ticketId);
      setComments(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setError('');
    setSubmitting(true);
    try {
      const newComment = await addComment(ticketId, content.trim());
      setComments((prev) => [...prev, newComment]);
      setContent('');
      setIsPreview(false);
    } catch {
      setError('댓글 등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditStart = (c: CommentItem) => {
    setEditingId(c.id);
    setEditContent(c.content);
    setEditPreview(false);
    setEditError('');
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditContent('');
    setEditError('');
  };

  const handleEditSave = async (commentId: number) => {
    if (!editContent.trim()) return;
    setEditError('');
    setEditSaving(true);
    try {
      const updated = await updateComment(ticketId, commentId, editContent.trim());
      setComments((prev) => prev.map((c) => c.id === commentId ? updated : c));
      setEditingId(null);
      setEditContent('');
    } catch {
      setEditError('수정에 실패했습니다.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (commentId: number) => {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;
    setDeletingId(commentId);
    try {
      await deleteComment(ticketId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  };

  const isAuthor = (comment: CommentItem) =>
    currentUser?.id === comment.authorId;
  const canEdit = (comment: CommentItem) =>
    !!currentUser && isAuthor(comment);
  const canDelete = (comment: CommentItem) =>
    !!currentUser && (isAuthor(comment) || currentUser.role === 'ADMIN');

  return (
    <div className="dt-card p-6">
      <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-3 mb-5">
        댓글{comments.length > 0 && (
          <span className="ml-1 text-gray-400 font-normal">({comments.length})</span>
        )}
      </h3>

      {/* ── 댓글 목록 ── */}
      {loading ? (
        <p className="text-xs text-gray-400 py-6 text-center">불러오는 중...</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-gray-400 py-6 text-center">첫 번째 댓글을 남겨보세요.</p>
      ) : (
        <div className="space-y-4 mb-6">
          {comments.map((c) => {
            const initials  = getInitials(c.authorName);
            const avatarCls = getAvatarColor(c.authorName);
            const isMine    = isAuthor(c);
            const isEditing = editingId === c.id;

            return (
              <div key={c.id} className="flex gap-3">
                {/* Avatar */}
                <div
                  className={`w-9 h-9 rounded-full ${avatarCls} text-white flex items-center justify-center text-xs font-bold flex-shrink-0 select-none mt-0.5`}
                >
                  {initials}
                </div>

                {/* Comment card */}
                <div className="flex-1 min-w-0 border border-gray-200 rounded-lg overflow-hidden">
                  {/* Header bar */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <span className="text-sm font-semibold text-gray-900 leading-none">
                      {c.authorName}
                    </span>
                    <span className="text-xs text-gray-400">@{c.authorUsername}</span>
                    <span className="text-xs text-gray-400">{timeAgo(c.createdAt)}</span>
                    {c.updatedAt && c.updatedAt !== c.createdAt && (
                      <span className="text-xs text-gray-400 italic">(수정됨)</span>
                    )}

                    {/* Badges + Actions */}
                    <div className="ml-auto flex items-center gap-1.5">
                      {isMine && (
                        <span className="text-xs border border-gray-300 text-gray-500 rounded-full px-2 py-0.5 font-medium leading-none">
                          작성자
                        </span>
                      )}
                      {currentUser?.role === 'ADMIN' && !isMine && (
                        <span className="text-xs border border-violet-300 text-violet-600 rounded-full px-2 py-0.5 font-medium leading-none">
                          관리자
                        </span>
                      )}

                      {/* 수정 버튼 (작성자만) */}
                      {canEdit(c) && !isEditing && (
                        <button
                          onClick={() => handleEditStart(c)}
                          title="수정"
                          className="ml-1 p-0.5 text-gray-400 hover:text-[var(--dt-primary)] transition-colors rounded"
                        >
                          {/* pencil icon */}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                      )}

                      {/* 삭제 버튼 */}
                      {canDelete(c) && !isEditing && (
                        <button
                          onClick={() => handleDelete(c.id)}
                          disabled={deletingId === c.id}
                          title="삭제"
                          className="p-0.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40 rounded"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Body */}
                  {isEditing ? (
                    /* ── 수정 모드 ── */
                    <div className="bg-white p-3">
                      <MarkdownEditor
                        value={editContent}
                        onChange={setEditContent}
                        onCtrlEnter={() => handleEditSave(c.id)}
                        placeholder="댓글을 수정하세요..."
                        rows={4}
                        isPreview={editPreview}
                        onPreviewChange={setEditPreview}
                      />
                      <div className="flex items-center justify-between mt-2">
                        {editError ? (
                          <p className="text-xs text-red-500">{editError}</p>
                        ) : (
                          <span className="text-xs text-gray-400">Ctrl+Enter로 저장</span>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={handleEditCancel}
                            className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            취소
                          </button>
                          <button
                            onClick={() => handleEditSave(c.id)}
                            disabled={editSaving || !editContent.trim()}
                            className="text-xs px-3 py-1.5 rounded bg-[var(--dt-primary)] text-white hover:bg-[var(--dt-primary-dark)] transition-colors disabled:opacity-40"
                          >
                            {editSaving ? '저장 중...' : '저장'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── 읽기 모드 ── */
                    <div className="bg-white">
                      <CommentBodyBoundary content={c.content} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 댓글 입력 ── */}
      {currentUser && (
        <div className="flex gap-3">
          {/* Avatar */}
          <div
            className={`w-9 h-9 rounded-full ${getAvatarColor(currentUser.displayName)} text-white flex items-center justify-center text-xs font-bold flex-shrink-0 select-none`}
          >
            {getInitials(currentUser.displayName)}
          </div>

          {/* Input card */}
          <div className="flex-1 min-w-0">
            <MarkdownEditor
              value={content}
              onChange={setContent}
              onCtrlEnter={handleSubmit}
              placeholder="댓글을 입력하세요... (마크다운 지원, @username으로 멘션)"
              rows={4}
              isPreview={isPreview}
              onPreviewChange={setIsPreview}
            />
            <div className="flex items-center justify-between mt-2">
              {error ? (
                <p className="text-xs text-red-500">{error}</p>
              ) : (
                <span className="text-xs text-gray-400">Ctrl+Enter로 등록 · 마크다운 지원</span>
              )}
              <button
                onClick={handleSubmit}
                disabled={submitting || !content.trim()}
                className="dt-btn dt-btn-primary text-xs px-4 py-1.5 disabled:opacity-40"
              >
                {submitting ? '등록 중...' : '댓글 등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommentSection;

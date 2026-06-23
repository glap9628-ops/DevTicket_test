import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NotificationItem } from './notificationApi';
import { markRead, markAllRead } from './notificationApi';

const TYPE_META: Record<string, { label: string; bgColor: string; textColor: string; icon: string }> = {
  PICKED_UP:      { label: 'PICKUP',  bgColor: 'var(--dt-primary-light)',      textColor: 'var(--dt-primary)',      icon: '↑'  },
  STATUS_CHANGED: { label: 'DONE',    bgColor: 'var(--dt-tone-done-bg)',        textColor: 'var(--dt-tone-done)',    icon: '✓'  },
  QA_REQUESTED:   { label: 'QA',      bgColor: 'var(--dt-tone-progress-bg)',    textColor: 'var(--dt-tone-progress)',icon: 'Q'  },
  COMMENTED:      { label: 'COMMENT', bgColor: 'var(--dt-tone-neutral-bg)',     textColor: 'var(--dt-tone-neutral)', icon: '—'  },
  MENTIONED:      { label: 'MENTION', bgColor: 'var(--dt-tone-waiting-bg)',     textColor: 'var(--dt-tone-waiting)', icon: '@'  },
  URGENT_CHANGED: { label: 'URGENT',  bgColor: 'var(--dt-tone-urgent-bg)',      textColor: 'var(--dt-tone-urgent)',  icon: '!'  },
  REOPENED:       { label: 'REOPEN',  bgColor: 'var(--dt-tone-waiting-bg)',     textColor: 'var(--dt-tone-waiting)', icon: '↺'  },
  TICKET_CREATED: { label: 'NEW',     bgColor: 'var(--dt-tone-progress-bg)',    textColor: 'var(--dt-tone-progress)',icon: '+'  },
};

const DEFAULT_META = {
  label: 'NEW',
  bgColor: 'var(--dt-tone-progress-bg)',
  textColor: 'var(--dt-tone-progress)',
  icon: '·',
};

function formatNotifTime(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day   = d.getDate();
  const hour  = String(d.getHours()).padStart(2, '0');
  const min   = String(d.getMinutes()).padStart(2, '0');
  return `${month}월 ${day}일 ${hour}:${min}`;
}

interface Props {
  notifications: NotificationItem[];
  unreadCount: number;
  onClose: () => void;
  onRefresh: () => void;
}

const NotificationDropdown = ({ notifications, unreadCount, onClose, onRefresh }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleItemClick = (n: NotificationItem) => {
    onClose();
    navigate(`/tickets/${n.ticketId}`);
    if (!n.read) {
      markRead(n.id).then(onRefresh).catch(() => {});
    }
  };

  const handleMarkAll = async () => {
    await markAllRead();
    onRefresh();
  };

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-2 z-50 bg-white rounded-xl shadow-2xl w-80 overflow-hidden"
      style={{ border: '1px solid var(--dt-border)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--dt-border)' }}
      >
        <span
          className="text-sm font-semibold flex items-center gap-1.5"
          style={{ color: 'var(--dt-text-primary)' }}
        >
          알림
          {unreadCount > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
              style={{ backgroundColor: 'var(--dt-tone-urgent)' }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAll}
            className="text-xs font-medium transition-opacity hover:opacity-70"
            style={{ color: 'var(--dt-primary)' }}
          >
            모두 읽음
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <p
            className="text-xs text-center py-8"
            style={{ color: 'var(--dt-text-muted)' }}
          >
            알림이 없습니다.
          </p>
        ) : (
          notifications.map((n) => {
            const meta = TYPE_META[n.type] ?? DEFAULT_META;
            return (
              <div
                key={n.id}
                onClick={() => handleItemClick(n)}
                className="flex gap-3 px-4 py-3 cursor-pointer transition-colors last:border-0"
                style={{
                  backgroundColor: !n.read ? 'var(--dt-primary-light)' : 'transparent',
                  borderBottom: '1px solid var(--dt-border)',
                  opacity: 1,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--dt-bg)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = !n.read ? 'var(--dt-primary-light)' : 'transparent';
                }}
              >
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: meta.bgColor, color: meta.textColor }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p
                    className="text-xs leading-relaxed"
                    style={{
                      color: !n.read ? 'var(--dt-text-primary)' : 'var(--dt-text-secondary)',
                      fontWeight: !n.read ? 500 : 400,
                    }}
                  >
                    {n.message}
                  </p>
                  <p
                    className="text-[10px] mt-0.5"
                    style={{ color: 'var(--dt-text-muted)' }}
                  >
                    {formatNotifTime(n.createdAt)}
                  </p>
                </div>

                {/* Unread dot */}
                {!n.read && (
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: 'var(--dt-primary)' }}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default NotificationDropdown;

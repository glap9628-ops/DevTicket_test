import { UserSearchResult } from './mentionApi';

interface Props {
  users: UserSearchResult[];
  isLoading: boolean;
  selectedIndex: number;
  onSelect: (user: UserSearchResult) => void;
}

const WATCH_TYPE_LABEL: Record<string, string> = {
  auto_requester: '요청자',
  auto_assignee: '담당자',
  auto_mention: '멘션',
  manual: '구독',
};

const MentionDropdown = ({ users, isLoading, selectedIndex, onSelect }: Props) => {
  if (isLoading) {
    return (
      <div className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-64 py-2 text-sm text-gray-400 px-3">
        검색 중...
      </div>
    );
  }

  if (users.length === 0) return null;

  return (
    <div className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-64 overflow-hidden">
      {users.map((user, idx) => (
        <button
          key={user.userId}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onSelect(user); }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
            idx === selectedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
          }`}
        >
          {/* 아바타 이니셜 */}
          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {user.displayName.slice(-2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{user.displayName}</div>
            <div className="text-xs text-gray-400 truncate">@{user.username} · {user.groupName}</div>
          </div>
        </button>
      ))}
    </div>
  );
};

export default MentionDropdown;

import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LayoutList,
  Inbox,
  SlidersHorizontal,
  Users,
  ChevronsLeft,
  ChevronsRight,
  GanttChartSquare,
  Calendar,
  BarChart2,
} from 'lucide-react';
import type { User } from '@/types/auth';

// ─── 타입 정의 ────────────────────────────────────────────────────────────────
type Role = 'ADMIN' | 'DEVELOPER' | 'REQUESTER';
type LucideIcon = React.ElementType;

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  to: string;
  roles?: Role[];
}

interface NavSection {
  id: string;
  label: string;
  roles?: Role[];
  items: NavItem[];
}

// ─── 메뉴 구조 정의 ──────────────────────────────────────────────────────────
const NAV_SECTIONS: NavSection[] = [
  {
    id: 'work',
    label: '업무',
    items: [
      {
        id: 'my-tickets',
        label: '내 티켓',
        icon: Inbox,
        to: '/my-tickets',
      },
      {
        id: 'tickets',
        label: '전체 티켓',
        icon: LayoutList,
        to: '/board',
      },
      {
        id: 'dashboard',
        label: '티켓 대시보드',
        icon: LayoutDashboard,
        to: '/dashboard',
      },
    ],
  },
  {
    id: 'wbs',
    label: 'WBS',
    roles: ['ADMIN', 'DEVELOPER'],
    items: [
      {
        id: 'wbs-status',
        label: 'Reports',
        icon: BarChart2,
        to: '/wbs',
        roles: ['ADMIN', 'DEVELOPER'],
      },
      {
        id: 'wbs-gantt',
        label: 'Timeline',
        icon: GanttChartSquare,
        to: '/wbs?tab=gantt',
        roles: ['ADMIN', 'DEVELOPER'],
      },
      {
        id: 'wbs-calendar',
        label: 'Calendar',
        icon: Calendar,
        to: '/wbs?tab=calendar',
        roles: ['ADMIN', 'DEVELOPER'],
      },
    ],
  },
  {
    id: 'admin',
    label: '관리',
    roles: ['ADMIN'],
    items: [
      {
        id: 'admin-tickets',
        label: '티켓관리',
        icon: SlidersHorizontal,
        to: '/admin?tab=tickets',
      },
      {
        id: 'admin-users',
        label: '사용자관리',
        icon: Users,
        to: '/admin?tab=users',
      },
    ],
  },
];

// ─── Active 판별 ─────────────────────────────────────────────────────────────
function isItemActive(id: string, pathname: string, tab: string): boolean {
  switch (id) {
    case 'dashboard':     return pathname === '/dashboard';
    case 'tickets':       return pathname === '/board';
    case 'my-tickets':    return pathname === '/my-tickets';
    case 'wbs-status':    return pathname === '/wbs' && (tab === '' || tab === 'status');
    case 'wbs-gantt':     return pathname === '/wbs' && tab === 'gantt';
    case 'wbs-calendar':  return pathname === '/wbs' && tab === 'calendar';
    case 'admin-tickets': return pathname === '/admin' && tab !== 'users';
    case 'admin-users':   return pathname === '/admin' && tab === 'users';
    default:              return false;
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  user: User | null;
  collapsed: boolean;
  onToggle: () => void;
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────
const Sidebar = ({ user, collapsed, onToggle }: Props) => {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const tab = new URLSearchParams(search).get('tab') ?? '';

  const userRole = user?.role as Role | undefined;

  /** 역할 제한이 있는 항목 필터 */
  const canShow = (roles?: Role[]) =>
    !roles || (userRole != null && roles.includes(userRole));

  /** 섹션 자체 역할 필터 + 보여줄 item 존재 여부 */
  const visibleSections = NAV_SECTIONS.filter(
    (s) => canShow(s.roles) && s.items.some((i) => canShow(i.roles))
  );

  return (
    <nav
      className={`dt-sidebar${collapsed ? ' collapsed' : ''}`}
      aria-label="주요 메뉴"
    >
      {/* ── Collapse 토글 ── */}
      <button
        className="dt-sidebar-toggle"
        onClick={onToggle}
        title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
        aria-label={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
      >
        {collapsed
          ? <ChevronsRight size={14} strokeWidth={2} />
          : <ChevronsLeft  size={14} strokeWidth={2} />
        }
      </button>

      {/* ── 섹션 목록 ── */}
      <div className="dt-nav-sections">
        {visibleSections.map((section, sIdx) => (
          <div key={section.id} className="dt-nav-section">

            {/* 섹션 구분선 (첫 번째 제외) */}
            {sIdx > 0 && <div className="dt-nav-divider" />}

            {/* 그룹 레이블 */}
            <span className="dt-nav-group-label" aria-hidden="true">
              {section.label}
            </span>

            {/* 메뉴 아이템 */}
            {section.items
              .filter((item) => canShow(item.roles))
              .map((item) => {
                const active = isItemActive(item.id, pathname, tab);
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    data-label={item.label}
                    className={`dt-nav-item${active ? ' active' : ''}`}
                    onClick={() => navigate(item.to)}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon
                      size={16}
                      strokeWidth={active ? 2.2 : 1.8}
                      style={{ flexShrink: 0 }}
                    />
                    <span className="dt-nav-label">{item.label}</span>
                  </button>
                );
              })}
          </div>
        ))}
      </div>
    </nav>
  );
};

export default Sidebar;

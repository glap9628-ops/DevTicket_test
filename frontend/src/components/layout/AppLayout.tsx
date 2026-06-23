import { Outlet, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { UserMenuButton } from '@/features/auth/components/UserMenuButton';
import { getMe } from '@/features/auth/api';
import type { User } from '@/types/auth';
import NotificationBell from '@/features/notification/NotificationBell';

const AppLayout = () => {
  const [user, setUser] = useState<User | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => navigate('/login', { replace: true }));
  }, [navigate]);

  return (
    <div className="dt-layout">
      <header className="dt-header">
        <button
          type="button"
          className="dt-header-brand"
          onClick={() => navigate('/dashboard')}
          title="대시보드로 이동"
        >
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="innotium"
            className="dt-header-logo"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </button>
        <div className="dt-header-divider" />
        <span className="dt-header-subtitle">개발 티켓 관리 시스템</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <NotificationBell />
          <UserMenuButton user={user} />
        </div>
      </header>

      <div className="dt-layout-body">
        <Sidebar
          user={user}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
        />
        <div className="dt-main-wrapper">
          <main className="dt-main">
            <Outlet />
          </main>
          <footer className="dt-footer">
            © {new Date().getFullYear()} Innotium. All rights reserved.
          </footer>
        </div>
      </div>
    </div>
  );
};

export default AppLayout;

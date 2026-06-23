import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import LoginPage from '@/features/auth/pages/LoginPage';
import TicketBoardPage from '@/features/ticket/pages/TicketBoardPage';
import TicketCreatePage from '@/features/ticket/pages/TicketCreatePage';
import TicketDetailPage from '@/features/ticket/pages/TicketDetailPage';
import DashboardPage from '@/features/dashboard/pages/DashboardPage';
import MyTicketsPage from '@/features/myticket/pages/MyTicketsPage';
import AdminPage from '@/features/admin/pages/AdminPage';
import WbsPage from '@/features/wbs/pages/WbsPage';

const App = () => {
  return (
    <BrowserRouter basename="/devticket">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/board" element={<TicketBoardPage />} />
          <Route path="/tickets/new" element={<TicketCreatePage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/my-tickets" element={<MyTicketsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/wbs" element={<WbsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;

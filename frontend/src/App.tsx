import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import { CampaignsPage } from './pages/CampaignsPage';
import { ComposePage } from './pages/ComposePage';
import { EmailDetailPage } from './pages/EmailDetailPage';
import { EmailListPage } from './pages/EmailListPage';
import { LoginPage } from './pages/LoginPage';
import { PrivacyPage } from './pages/PrivacyPage';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/scheduled" replace />} />
              <Route path="/scheduled" element={<EmailListPage key="scheduled" tab="scheduled" />} />
              <Route path="/sent" element={<EmailListPage key="sent" tab="sent" />} />
              <Route path="/campaigns" element={<CampaignsPage />} />
              <Route path="/compose" element={<ComposePage />} />
              <Route path="/email/:id" element={<EmailDetailPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

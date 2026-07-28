import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { getToken } from './services/api';
import { ToastHost } from './utils/toast';
import { ErrorBoundary } from './components/ErrorBoundary';

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const TemplateList = lazy(() => import('./pages/TemplateList').then((m) => ({ default: m.TemplateList })));
const TemplateEditor = lazy(() => import('./pages/TemplateEditor').then((m) => ({ default: m.TemplateEditor })));
const AssignmentList = lazy(() => import('./pages/AssignmentList').then((m) => ({ default: m.AssignmentList })));
const ReportFill = lazy(() => import('./pages/ReportFill').then((m) => ({ default: m.ReportFill })));
const ApprovalList = lazy(() => import('./pages/ApprovalList').then((m) => ({ default: m.ApprovalList })));
const AggregationView = lazy(() => import('./pages/AggregationView').then((m) => ({ default: m.AggregationView })));
const OrganizationManagement = lazy(() => import('./pages/OrganizationManagement').then((m) => ({ default: m.OrganizationManagement })));
const GlobalReadOnlyView = lazy(() => import('./pages/GlobalReadOnlyView').then((m) => ({ default: m.GlobalReadOnlyView })));

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="text-sm text-slate-400">页面加载中...</div>
  </div>
);

const UnauthorizedHandler: React.FC = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = () => navigate('/login');
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, [navigate]);
  return null;
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = getToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

export default function App() {
  return (
    <BrowserRouter>
      <UnauthorizedHandler />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Public Login Route */}
          <Route path="/login" element={<Login />} />

          {/* Protected Application Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="templates" element={<ErrorBoundary><TemplateList /></ErrorBoundary>} />
            <Route path="templates/:id" element={<ErrorBoundary><TemplateEditor /></ErrorBoundary>} />
            <Route path="assignments" element={<ErrorBoundary><AssignmentList /></ErrorBoundary>} />
            <Route path="fill" element={<ErrorBoundary><AssignmentList /></ErrorBoundary>} />
            <Route path="fill/:assignmentId" element={<ErrorBoundary><ReportFill /></ErrorBoundary>} />
            <Route path="approvals" element={<ErrorBoundary><ApprovalList /></ErrorBoundary>} />
            <Route path="aggregation" element={<ErrorBoundary><AggregationView /></ErrorBoundary>} />
            <Route path="organizations" element={<ErrorBoundary><OrganizationManagement /></ErrorBoundary>} />
            <Route path="global-view" element={<ErrorBoundary><GlobalReadOnlyView /></ErrorBoundary>} />
            <Route path="template-approvals" element={<Navigate to="/approvals" replace />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <ToastHost />
    </BrowserRouter>
  );
}

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { getToken } from './services/api';
import { ToastHost } from './utils/toast';

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
            <Route index element={<Dashboard />} />
            <Route path="templates" element={<TemplateList />} />
            <Route path="templates/:id" element={<TemplateEditor />} />
            <Route path="assignments" element={<AssignmentList />} />
            <Route path="fill" element={<AssignmentList />} />
            <Route path="fill/:assignmentId" element={<ReportFill />} />
            <Route path="approvals" element={<ApprovalList />} />
            <Route path="aggregation" element={<AggregationView />} />
            <Route path="organizations" element={<OrganizationManagement />} />
            <Route path="global-view" element={<GlobalReadOnlyView />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <ToastHost />
    </BrowserRouter>
  );
}

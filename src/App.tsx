import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { TemplateList } from './pages/TemplateList';
import { TemplateEditor } from './pages/TemplateEditor';
import { AssignmentList } from './pages/AssignmentList';
import { ReportFill } from './pages/ReportFill';
import { ApprovalList } from './pages/ApprovalList';
import { AggregationView } from './pages/AggregationView';
import { getToken } from './services/api';

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
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

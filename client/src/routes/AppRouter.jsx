import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

// Layout
import MainLayout from '../components/layout/MainLayout';
import { Spinner } from '../components/ui';

// Lazy loaded pages
const Home = lazy(() => import('../pages/Home/Home'));
const Upload = lazy(() => import('../pages/Upload/Upload'));
const Mapping = lazy(() => import('../pages/Mapping/Mapping'));
const Quiz = lazy(() => import('../pages/Quiz/Quiz'));
const Result = lazy(() => import('../pages/Result/Result'));
const Dashboard = lazy(() => import('../pages/Dashboard/Dashboard'));
const Login = lazy(() => import('../pages/Auth/Login'));
const Register = lazy(() => import('../pages/Auth/Register'));
const Settings = lazy(() => import('../pages/Settings/Settings'));
const SettingsProfile = lazy(() => import('../pages/Settings/Profile'));
const SettingsPreferences = lazy(() => import('../pages/Settings/Preferences'));
const SharedSession = lazy(() => import('../pages/Session/SharedSession'));
const SessionQuiz = lazy(() => import('../pages/Session/SessionQuiz'));
const Admin = lazy(() => import('../pages/Admin/Admin'));

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><Spinner size={40} /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
    <Spinner size={40} />
  </div>
);

export default function AppRouter() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="upload" element={<Upload />} />
          <Route path="mapping/:uploadId" element={<Mapping />} />
          <Route path="quiz/:quizId" element={<Quiz />} />
          <Route path="result/:attemptId" element={<Result />} />

          {/* Protected Routes */}
          <Route path="dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />

          <Route path="admin" element={
            <ProtectedRoute>
              <Admin />
            </ProtectedRoute>
          } />

          <Route path="settings" element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }>
            <Route index element={<SettingsProfile />} />
            <Route path="profile" element={<SettingsProfile />} />
            <Route path="preferences" element={<SettingsPreferences />} />
          </Route>

          {/* Session Routes (within main layout for landing page) */}
          <Route path="session/:shareCode" element={
            <ProtectedRoute>
              <SharedSession />
            </ProtectedRoute>
          } />

          {/* Auth Routes */}
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
        </Route>

        {/* Session Quiz — standalone full-screen layout (outside MainLayout) */}
        <Route path="session/:shareCode/quiz" element={
          <ProtectedRoute>
            <SessionQuiz />
          </ProtectedRoute>
        } />
      </Routes>
    </Suspense>
  );
}


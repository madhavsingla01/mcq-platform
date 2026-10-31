import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

// Layout
import MainLayout from '../components/layout/MainLayout';
import { Spinner } from '../components/ui';

// Lazy loaded pages
const Home = lazy(() => import('../pages/Home/Home'));
const Explore = lazy(() => import('../pages/Explore/Explore'));
const CreateHub = lazy(() => import('../pages/Create/CreateHub'));
const Upload = lazy(() => import('../pages/Upload/Upload'));
const ManualBuilder = lazy(() => import('../pages/Create/ManualBuilder'));
const ChallengeBuilder = lazy(() => import('../pages/Create/ChallengeBuilder'));
const Mapping = lazy(() => import('../pages/Mapping/Mapping'));
const Quiz = lazy(() => import('../pages/Quiz/Quiz'));
const QuizSettings = lazy(() => import('../pages/Quiz/QuizSettings'));
const Result = lazy(() => import('../pages/Result/Result'));
const Dashboard = lazy(() => import('../pages/Dashboard/Dashboard'));
const Challenges = lazy(() => import('../pages/Challenges/Challenges'));
const Login = lazy(() => import('../pages/Auth/Login'));
const Register = lazy(() => import('../pages/Auth/Register'));
const Settings = lazy(() => import('../pages/Settings/Settings'));
const PublicProfile = lazy(() => import('../pages/Profile/PublicProfile'));
const Notifications = lazy(() => import('../pages/Notifications/Notifications'));
const Messages = lazy(() => import('../pages/Messages/Messages'));
const Guide = lazy(() => import('../pages/Guide/Guide'));

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--color-bg)' }}>
        <Spinner size={40} />
      </div>
    );
  }

  if (!isAuthenticated) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  return children;
}

function PublicOnlyRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--color-bg)' }}>
        <Spinner size={40} />
      </div>
    );
  }

  if (isAuthenticated) {
    const redirectTo = new URLSearchParams(location.search).get('redirect') || '/dashboard';
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}

const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--color-bg)' }}>
    <Spinner size={40} />
  </div>
);

export default function AppRouter() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Standalone Authentication Pages (Separate from MainLayout, NO Header) */}
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <Register />
            </PublicOnlyRoute>
          }
        />

        {/* Root Redirect: directs to /explore if logged in, or /login if not logged in */}
        <Route path="/" element={<Home />} />

        {/* Protected Application Routes (Inside MainLayout with Header) */}
        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route path="explore" element={<Explore />} />
          <Route path="quizzes" element={<Explore />} />
          <Route path="guide" element={<Guide />} />
          <Route path="how-it-works" element={<Guide />} />

          {/* Create Hub & Builders */}
          <Route path="create" element={<CreateHub />} />
          <Route path="create/upload" element={<Upload />} />
          <Route path="create/manual" element={<ManualBuilder />} />
          <Route path="create/quiz" element={<ManualBuilder />} />
          <Route path="create/challenge" element={<ChallengeBuilder />} />
          <Route path="upload" element={<Navigate to="/create/upload" replace />} />

          <Route path="mapping/:uploadId" element={<Mapping />} />
          <Route path="result/:attemptId" element={<Result />} />
          <Route path="quiz/:quizId/settings" element={<QuizSettings />} />
          <Route path="quizzes/:quizId/settings" element={<QuizSettings />} />

          {/* Quiz Taking Route */}
          <Route path="quiz/:quizId" element={<Quiz />} />

          {/* Dashboard & Attempts */}
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="attempts" element={<Navigate to="/dashboard" replace />} />

          {/* Challenges */}
          <Route path="challenges" element={<Challenges />} />
          <Route path="challenge" element={<Navigate to="/challenges" replace />} />

          {/* Settings */}
          <Route path="settings" element={<Settings />} />
          <Route path="settings/:tab" element={<Settings />} />

          {/* Notifications */}
          <Route path="notifications" element={<Notifications />} />

          {/* Direct Messages (Instagram-style inbox & chat) */}
          <Route path="messages" element={<Messages />} />
          <Route path="messages/:conversationId" element={<Messages />} />

          {/* Public Profile */}
          <Route path="profile/:profileId" element={<PublicProfile />} />
          <Route path="users/:profileId" element={<PublicProfile />} />
          <Route path=":profileId" element={<PublicProfile />} />
        </Route>

        {/* Catch-all route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

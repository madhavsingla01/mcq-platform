import { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

// Layout
import MainLayout from '../components/layout/MainLayout';
import { Spinner } from '../components/ui';
import api from '../api/axios';

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

const Admin = lazy(() => import('../pages/Admin/Admin'));
const PublicProfile = lazy(() => import('../pages/Profile/PublicProfile'));
const Leaderboard = lazy(() => import('../pages/Leaderboard/Leaderboard'));

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

function SessionQuizRedirect() {
  const { shareCode } = useParams();
  const [resolved, setResolved] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      try {
        const { data } = await api.get(`/sessions/code/${shareCode}`);
        const session = data.data.session;
        const quizId = session?.quiz?._id;
        if (!cancelled && quizId) {
          navigate(`/quiz/${quizId}?sessionId=${session._id}&shareCode=${shareCode}`, { replace: true });
        } else if (!cancelled) {
          setError('Quiz not found for this session');
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Session not found');
      }
      if (!cancelled) setResolved(true);
    };
    resolve();
    return () => { cancelled = true; };
  }, [shareCode, navigate]);

  if (error) {
    const requiresLogin = /log in/i.test(error);
    return (
      <div style={{ textAlign: 'center', padding: '60px 16px', color: requiresLogin ? 'var(--color-text)' : 'var(--color-danger)' }}>
        <p style={{ marginBottom: 16 }}>{error}</p>
        {requiresLogin ? (
          <button
            type="button"
            onClick={() => navigate(`/login?redirect=${encodeURIComponent(`/session/${shareCode}`)}`)}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid var(--color-primary)',
              background: 'var(--color-primary)',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Log in
          </button>
        ) : null}
      </div>
    );
  }
  return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><Spinner size={40} /></div>;
}

export default function AppRouter() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="upload" element={<Upload />} />
          <Route path="mapping/:uploadId" element={<Mapping />} />
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
          <Route path="session/:shareCode" element={<SharedSession />} />
          <Route path="leaderboard" element={<Leaderboard />} />

          {/* Public Profile */}
          <Route path=":profileId" element={<PublicProfile />} />

          {/* Auth Routes */}
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
        </Route>

        {/* Session Quiz — redirect to unified quiz page */}
        <Route path="session/:shareCode/quiz" element={<SessionQuizRedirect />} />
        <Route path="quiz/:quizId" element={<Quiz />} />
      </Routes>
    </Suspense>
  );
}

import { lazy, Suspense, useState } from 'react';
import { createRoutesFromElements, matchRoutes, Route, Navigate, useLocation, useRoutes } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authRedirect } from '../utils/authRedirect';

// Layout
import MainLayout from '../components/layout/MainLayout';
import PageHeader from '../components/layout/PageHeader';
import GlobalSearchModal from '../components/search/GlobalSearchModal';
import { PageSearchContext } from '../components/search/PageSearchContext';
import { Spinner } from '../components/ui';

// Lazy loaded pages
const Home = lazy(() => import('../pages/Home/Home'));
const Explore = lazy(() => import('../pages/Explore/Explore'));
const CreateHub = lazy(() => import('../pages/Create/CreateHub'));
const Upload = lazy(() => import('../pages/Upload/Upload'));
const ImportPdf = lazy(() => import('../pages/Create/ImportPdf'));
const ManualBuilder = lazy(() => import('../pages/Create/ManualBuilder'));
const ChallengeBuilder = lazy(() => import('../pages/Create/ChallengeBuilder'));
const Mapping = lazy(() => import('../pages/Mapping/Mapping'));
const Quiz = lazy(() => import('../pages/Quiz/Quiz'));
const QuizSettings = lazy(() => import('../pages/Quiz/QuizSettings'));
const Result = lazy(() => import('../pages/Result/Result'));
const Dashboard = lazy(() => import('../pages/Dashboard/Dashboard'));
const Challenges = lazy(() => import('../pages/Challenges/Challenges'));
const CompetitionLeaderboardPage = lazy(() => import('../pages/Challenges/CompetitionLeaderboardPage'));
const Login = lazy(() => import('../pages/Auth/Login'));
const Register = lazy(() => import('../pages/Auth/Register'));
const Settings = lazy(() => import('../pages/Settings/Settings'));
const PublicProfile = lazy(() => import('../pages/Profile/PublicProfile'));
const Notifications = lazy(() => import('../pages/Notifications/Notifications'));
const Messages = lazy(() => import('../pages/Messages/Messages'));
const Guide = lazy(() => import('../pages/Guide/Guide'));

// Admin Pages
const AdminLayout = lazy(() => import('../pages/Admin/AdminLayout'));
const AdminOverview = lazy(() => import('../pages/Admin/AdminOverview'));
const AdminUsers = lazy(() => import('../pages/Admin/AdminUsers'));
const AdminContent = lazy(() => import('../pages/Admin/AdminContent'));
const AdminReports = lazy(() => import('../pages/Admin/AdminReports'));
const AdminAuditLogs = lazy(() => import('../pages/Admin/AdminAuditLogs'));
const AdminSystemHealth = lazy(() => import('../pages/Admin/AdminSystemHealth'));

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'var(--app-screen-height)', background: 'var(--color-bg)' }}>
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'var(--app-screen-height)', background: 'var(--color-bg)' }}>
        <Spinner size={40} />
      </div>
    );
  }

  if (isAuthenticated) {
    const redirectTo = authRedirect(new URLSearchParams(location.search).get('redirect'));
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}

function AdminRoute({ children }) {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'var(--app-screen-height)', background: '#000000' }}>
        <Spinner size={40} />
      </div>
    );
  }

  if (!isAuthenticated) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'var(--app-screen-height)', background: 'var(--color-bg)' }}>
    <Spinner size={40} />
  </div>
);

const routes = createRoutesFromElements(
  <>
    {/* Standalone authentication pages */}
    <Route
      path="/login" handle="Log in"
      element={
        <PublicOnlyRoute>
          <Login />
        </PublicOnlyRoute>
      }
    />
    <Route
      path="/register" handle="Create account"
      element={
        <PublicOnlyRoute>
          <Register />
        </PublicOnlyRoute>
      }
    />

    {/* Root Redirect: directs to /explore if logged in, or /login if not logged in */}
    <Route path="/" element={<Home />} />

    {/* Protected application routes */}
    <Route
      element={
        <ProtectedRoute>
          <MainLayout />
        </ProtectedRoute>
      }
    >
      <Route path="explore" handle="Explore" element={<Explore />} />
      <Route path="quizzes" handle="Explore" element={<Explore />} />
      <Route path="guide" handle="Guide" element={<Guide />} />
      <Route path="how-it-works" handle="Guide" element={<Guide />} />

      {/* Create Hub & Builders */}
      <Route path="create" handle="Create" element={<CreateHub />} />
      <Route path="create/upload" handle="Import Sheet" element={<Upload />} />
      <Route path="create/import-pdf" handle="Import PDFs" element={<ImportPdf />} />
      <Route path="create/manual" handle="Manual Quiz Builder" element={<ManualBuilder />} />
      <Route path="create/quiz" handle="Manual Quiz Builder" element={<ManualBuilder />} />
      <Route path="create/challenge" handle="Challenge Builder" element={<ChallengeBuilder />} />
      <Route path="upload" element={<Navigate to="/create/upload" replace />} />

      <Route path="mapping/:uploadId" handle="Map Columns" element={<Mapping />} />
      <Route path="result/:attemptId" handle="Quiz Results" element={<Result />} />
      <Route path="quiz/:quizId/settings" handle="Quiz Settings" element={<QuizSettings />} />
      <Route path="quizzes/:quizId/settings" handle="Quiz Settings" element={<QuizSettings />} />

      {/* Quiz Taking Route */}
      <Route path="quiz/:quizId" handle="Quiz" element={<Quiz />} />

      {/* Dashboard & Attempts */}
      <Route path="dashboard" handle="Dashboard" element={<Dashboard />} />
      <Route path="attempts" element={<Navigate to="/dashboard" replace />} />

      {/* Challenges & Competitions */}
      <Route path="challenges" handle="Competition Arena" element={<Challenges />} />
      <Route path="challenges/:quizId" handle="Competition" element={<Quiz />} />
      <Route path="challenges/:quizId/standings" handle="Competition Standings" element={<CompetitionLeaderboardPage />} />
      <Route path="challenges/:quizId/leaderboard" handle="Competition Standings" element={<CompetitionLeaderboardPage />} />
      <Route path="challenge/:quizId" handle="Competition" element={<Quiz />} />
      <Route path="challenge/:quizId/standings" handle="Competition Standings" element={<CompetitionLeaderboardPage />} />
      <Route path="challenge/:quizId/leaderboard" handle="Competition Standings" element={<CompetitionLeaderboardPage />} />
      <Route path="challenge" element={<Navigate to="/challenges" replace />} />
      <Route path="competitions" element={<Navigate to="/challenges" replace />} />
      <Route path="competitions/:quizId" handle="Competition" element={<Quiz />} />
      <Route path="competitions/:quizId/standings" handle="Competition Standings" element={<CompetitionLeaderboardPage />} />
      <Route path="competitions/:quizId/leaderboard" handle="Competition Standings" element={<CompetitionLeaderboardPage />} />
      <Route path="competition/:quizId" handle="Competition" element={<Quiz />} />
      <Route path="competition/:quizId/standings" handle="Competition Standings" element={<CompetitionLeaderboardPage />} />
      <Route path="competition/:quizId/leaderboard" handle="Competition Standings" element={<CompetitionLeaderboardPage />} />

      {/* Settings */}
      <Route path="settings" handle="Settings" element={<Settings />} />
      <Route path="settings/:tab" handle="Settings" element={<Settings />} />

      {/* Notifications */}
      <Route path="notifications" handle="Notifications" element={<Notifications />} />

      {/* Direct Messages (Instagram-style inbox & chat) */}
      <Route path="messages" handle="Messages" element={<Messages />} />
      <Route path="messages/:conversationId" handle="Messages" element={<Messages />} />

      {/* Public Profile */}
      <Route path="profile/:profileId" handle="Profile" element={<PublicProfile />} />
      <Route path="users/:profileId" handle="Profile" element={<PublicProfile />} />
      <Route path=":profileId" handle="Profile" element={<PublicProfile />} />
    </Route>

    {/* Dedicated Admin Control Center (Separate Layout, Pure Black, RBAC) */}
    <Route
      path="/admin"
      element={
        <AdminRoute>
          <AdminLayout />
        </AdminRoute>
      }
    >
      <Route index handle="Platform Overview" element={<AdminOverview />} />
      <Route path="users" handle="User Management" element={<AdminUsers />} />
      <Route path="content" handle="Quizzes & Challenges" element={<AdminContent />} />
      <Route path="reports" handle="Moderation Queue" element={<AdminReports />} />
      <Route path="audit-logs" handle="Audit Trail" element={<AdminAuditLogs />} />
      <Route path="system" handle="System Health & Diagnostics" element={<AdminSystemHealth />} />
    </Route>

    {/* Catch-all route */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </>
);

function RoutedContent() {
  return useRoutes(routes);
}

const searchLabels = {
  dashboard: 'Search your quizzes',
  guide: 'Search guide',
  'how-it-works': 'Search guide',
  create: 'Search creation options',
  challenges: 'Search competitions',
  settings: 'Search settings',
  'settings/:tab': 'Search settings',
  notifications: 'Search notifications',
  messages: 'Search conversations',
  'messages/:conversationId': 'Search this conversation',
  'profile/:profileId': 'Search this profile',
  'users/:profileId': 'Search this profile',
  ':profileId': 'Search this profile',
  users: 'Search users',
  content: 'Search quizzes and challenges',
};

export default function AppRouter() {
  const location = useLocation();
  const match = matchRoutes(routes, location)?.at(-1);
  const title = match?.route.handle || 'QuizFocus';
  const path = match?.route.path;
  const isStandaloneAuthPage = path === '/login' || path === '/register';
  const advancedSearch = path === 'explore' || path === 'quizzes';
  const searchLabel = path === 'settings/:tab' && ['activity', 'data'].includes(match.params.tab?.toLowerCase())
    ? 'Search your activity' : searchLabels[path];
  const [search, setSearch] = useState({ pathname: location.pathname, query: '' });
  if (search.pathname !== location.pathname) setSearch({ pathname: location.pathname, query: '' });
  const setQuery = query => setSearch({ pathname: location.pathname, query });

  return (
    <PageSearchContext.Provider value={{ query: search.query, setQuery }}>
      {!isStandaloneAuthPage && <PageHeader title={title} searchLabel={searchLabel} advancedSearch={advancedSearch} />}
      <Suspense fallback={<LoadingFallback />}><RoutedContent /></Suspense>
      {advancedSearch && <GlobalSearchModal />}
    </PageSearchContext.Provider>
  );
}

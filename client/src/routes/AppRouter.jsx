import { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

// Layout
import MainLayout from '../components/layout/MainLayout';
import { Spinner } from '../components/ui';
import api from '../api/axios';

// Lazy loaded pages
const Home = lazy(() => import('../pages/Home/Home'));
const Explore = lazy(() => import('../pages/Explore/Explore'));
const CreateHub = lazy(() => import('../pages/Create/CreateHub'));
const Upload = lazy(() => import('../pages/Upload/Upload'));
const ManualBuilder = lazy(() => import('../pages/Create/ManualBuilder'));
const Mapping = lazy(() => import('../pages/Mapping/Mapping'));
const Quiz = lazy(() => import('../pages/Quiz/Quiz'));
const Result = lazy(() => import('../pages/Result/Result'));
const Dashboard = lazy(() => import('../pages/Dashboard/Dashboard'));
const Login = lazy(() => import('../pages/Auth/Login'));
const Register = lazy(() => import('../pages/Auth/Register'));
const Settings = lazy(() => import('../pages/Settings/Settings'));
const UserInfo = lazy(() => import('../pages/Settings/UserInfo'));
const PublicProfileSettings = lazy(() => import('../pages/Settings/PublicProfileSettings'));
const Security = lazy(() => import('../pages/Settings/Security'));
const SettingsPreferences = lazy(() => import('../pages/Settings/Preferences'));
const PublicProfile = lazy(() => import('../pages/Profile/PublicProfile'));
const Notifications = lazy(() => import('../pages/Notifications/Notifications'));

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><Spinner size={40} /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnlyRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();
  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><Spinner size={40} /></div>;
  const redirectTo = new URLSearchParams(location.search).get('redirect') || '/dashboard';
  if (isAuthenticated) return <Navigate to={redirectTo} replace />;
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
          <Route path="explore" element={<Explore />} />
          
          {/* Create Hub Routes */}
          <Route path="create" element={<CreateHub />} />
          <Route path="create/upload" element={<Upload />} />
          <Route path="upload" element={<Navigate to="/create/upload" replace />} />
          
          <Route path="mapping/:uploadId" element={<Mapping />} />
          <Route path="result/:attemptId" element={<Result />} />

          {/* Protected Routes */}
          <Route path="dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />



          <Route path="settings" element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="info" replace />} />
            <Route path="info" element={<UserInfo />} />
            <Route path="public" element={<PublicProfileSettings />} />
            <Route path="security" element={<Security />} />
            <Route path="preferences" element={<SettingsPreferences />} />
          </Route>

          <Route path="notifications" element={
            <ProtectedRoute>
              <Notifications />
            </ProtectedRoute>
          } />



          {/* Public Profile */}
          <Route path=":profileId" element={<PublicProfile />} />

          {/* Auth Routes */}
          <Route path="login" element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          } />
          <Route path="register" element={
            <PublicOnlyRoute>
              <Register />
            </PublicOnlyRoute>
          } />
        </Route>

        {/* Builder is outside MainLayout for full screen IDE feel */}
        <Route path="create/manual" element={
          <ProtectedRoute>
            <ManualBuilder />
          </ProtectedRoute>
        } />


        <Route path="quiz/:quizId" element={<Quiz />} />
      </Routes>
    </Suspense>
  );
}

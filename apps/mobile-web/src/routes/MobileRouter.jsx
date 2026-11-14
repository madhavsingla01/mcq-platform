import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MobileShell from '../components/layout/MobileShell';

const Dashboard = lazy(() => import('../pages/Dashboard/Dashboard'));
const Explore = lazy(() => import('../pages/Explore/Explore'));
const MarketplacePage = lazy(() => import('../pages/MarketplacePage'));
const MobileListingDetailsPage = lazy(() => import('../pages/marketplace/MobileListingDetailsPage'));
const MobileMarketplaceLibraryPage = lazy(() => import('../pages/marketplace/MobileMarketplaceLibraryPage'));
const MobileMarketplaceManagePage = lazy(() => import('../pages/marketplace/MobileMarketplaceManagePage'));
const Challenges = lazy(() => import('../pages/Challenges/Challenges'));
const QuizAttempt = lazy(() => import('../pages/QuizAttempt/QuizAttempt'));
const Result = lazy(() => import('../pages/Result/Result'));
const Profile = lazy(() => import('../pages/Profile/Profile'));
const Login = lazy(() => import('../pages/Auth/Login'));
const MobileMessages = lazy(() => import('../pages/Messages/MobileMessages'));
const MobileUploadPage = lazy(() => import('../pages/Upload/MobileUploadPage'));

function PageFallback() {
  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
    }}>
      <div style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        border: '3px solid var(--color-border)',
        borderTopColor: 'var(--color-accent)',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  );
}

export default function MobileRouter() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Full-screen auth page */}
        <Route path="/login" element={<Login />} />

        {/* Application Shell with TopBar and BottomTabBar */}
        <Route element={<MobileShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          <Route path="/marketplace/:listingId" element={<MobileListingDetailsPage />} />
          <Route path="/marketplace/library" element={<MobileMarketplaceLibraryPage />} />
          <Route path="/marketplace/manage" element={<MobileMarketplaceManagePage />} />
          <Route path="/upload" element={<MobileUploadPage />} />
          <Route path="/challenges" element={<Challenges />} />
          <Route path="/profile" element={<Profile />} />

          {/* Messaging Routes */}
          <Route path="/messages" element={<MobileMessages />} />
          <Route path="/messages/:conversationId" element={<MobileMessages />} />

          {/* Full Screen Quiz Attempt & Result */}
          <Route path="/quiz/:quizId" element={<QuizAttempt />} />
          <Route path="/result/:attemptId" element={<Result />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

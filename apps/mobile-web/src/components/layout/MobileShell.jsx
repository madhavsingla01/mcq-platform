import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import MobileHeader from './MobileHeader';
import BottomTabBar from './BottomTabBar';

export default function MobileShell() {
  const location = useLocation();

  // Hide top header and tab bar inside active quiz attempt or active 1-on-1 chat
  const isQuizAttempt = location.pathname.startsWith('/quiz/') && !location.pathname.includes('/settings');
  const isMessageChat = location.pathname.startsWith('/messages/') && location.pathname !== '/messages';
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const hideChrome = isQuizAttempt || isMessageChat || isAuthPage;

  return (
    <div className="mobile-app-root">
      {!hideChrome && <MobileHeader />}
      
      <main style={{
        flex: 1,
        paddingBottom: !hideChrome ? 'calc(var(--tabbar-height) + var(--safe-bottom) + 24px)' : '0px',
        width: '100%',
        minHeight: '100dvh',
      }}>
        <Outlet />
      </main>

      {!hideChrome && <BottomTabBar />}
    </div>
  );
}

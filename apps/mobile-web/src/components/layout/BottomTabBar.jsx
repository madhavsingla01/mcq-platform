import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Compass, Trophy, User, Zap, X, Play, Sparkles, MessageSquare, Store, UploadCloud } from 'lucide-react';

export default function BottomTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showQuickSheet, setShowQuickSheet] = useState(false);

  const isActive = (path) => {
    if (path === '/dashboard' && (location.pathname === '/' || location.pathname === '/dashboard')) return true;
    return location.pathname.startsWith(path);
  };

  const navItems = [
    { label: 'Home', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Explore', path: '/explore', icon: Compass },
    // Center Action Button placed between 2nd and 3rd items
    { label: 'Challenges', path: '/challenges', icon: Trophy },
    { label: 'Profile', path: '/profile', icon: User },
  ];

  return (
    <>
      {/* Quick Action Drawer / Sheet */}
      {showQuickSheet && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        onClick={() => setShowQuickSheet(false)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-elevated)',
              borderTop: '1px solid var(--color-border)',
              borderTopLeftRadius: 'var(--radius-sheet)',
              borderTopRightRadius: 'var(--radius-sheet)',
              padding: '20px 20px calc(24px + var(--safe-bottom)) 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={18} color="var(--color-accent)" />
                <span style={{ fontWeight: 700, fontSize: '17px', color: 'var(--color-text)' }}>Quick Actions</span>
              </div>
              <button 
                onClick={() => setShowQuickSheet(false)}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--bg-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick Practice Card */}
            <div 
              onClick={() => {
                setShowQuickSheet(false);
                navigate('/explore');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '14px',
                background: 'var(--bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-card)',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(255, 69, 0, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-accent)',
              }}>
                <Play size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>Start Random Practice</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Instant 10-question rapid quiz</div>
              </div>
            </div>

            {/* Daily Arena Challenge */}
            <div 
              onClick={() => {
                setShowQuickSheet(false);
                navigate('/challenges');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '14px',
                background: 'var(--bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-card)',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(48, 209, 88, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-success)',
              }}>
                <Sparkles size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>Today's Arena Challenge</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Earn 2x streak multiplier today</div>
              </div>
            </div>

            {/* Marketplace Quick Action */}
            <div 
              onClick={() => {
                setShowQuickSheet(false);
                navigate('/marketplace');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '14px',
                background: 'var(--bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-card)',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(255, 69, 0, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-accent)',
              }}>
                <Store size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>Quiz Marketplace</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Browse, acquire &amp; study quiz packages</div>
              </div>
            </div>

            {/* Upload Educational Resource Quick Action */}
            <div 
              onClick={() => {
                setShowQuickSheet(false);
                navigate('/upload');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '14px',
                background: 'var(--bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-card)',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(255, 69, 0, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-accent)',
              }}>
                <UploadCloud size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>Upload Resource</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Upload PDF, Excel, CSV, or question banks</div>
              </div>
            </div>

            {/* Direct Messages Quick Action */}
            <div 
              onClick={() => {
                setShowQuickSheet(false);
                navigate('/messages');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '14px',
                background: 'var(--bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-card)',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(14, 165, 233, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0ea5e9',
              }}>
                <MessageSquare size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>Study Messages</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Real-time chat & quiz challenges</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Tab Bar */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'rgba(10, 10, 12, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--color-border)',
        paddingBottom: 'var(--safe-bottom)',
        height: 'calc(var(--tabbar-height) + var(--safe-bottom))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        maxWidth: '480px',
        margin: '0 auto',
      }}>
        {/* Tab 1: Home */}
        <button
          onClick={() => navigate(navItems[0].path)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            flex: 1,
            color: isActive(navItems[0].path) ? 'var(--color-accent)' : 'var(--color-text-muted)',
            transition: 'color var(--duration-fast) var(--ease-out)',
          }}
        >
          <LayoutDashboard size={20} strokeWidth={isActive(navItems[0].path) ? 2.5 : 1.8} />
          <span style={{ fontSize: '10px', fontWeight: isActive(navItems[0].path) ? 700 : 500 }}>
            {navItems[0].label}
          </span>
        </button>

        {/* Tab 2: Explore */}
        <button
          onClick={() => navigate(navItems[1].path)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            flex: 1,
            color: isActive(navItems[1].path) ? 'var(--color-accent)' : 'var(--color-text-muted)',
            transition: 'color var(--duration-fast) var(--ease-out)',
          }}
        >
          <Compass size={20} strokeWidth={isActive(navItems[1].path) ? 2.5 : 1.8} />
          <span style={{ fontSize: '10px', fontWeight: isActive(navItems[1].path) ? 700 : 500 }}>
            {navItems[1].label}
          </span>
        </button>

        {/* Center Action Button (STRICT NO GLOW - Matte Pure Electric Orange) */}
        <div style={{ position: 'relative', flex: 1, display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => setShowQuickSheet(true)}
            aria-label="Quick Actions"
            style={{
              width: '46px',
              height: '46px',
              borderRadius: 'var(--radius-pill)',
              background: '#FF4500',
              border: '2px solid #000000',
              boxShadow: 'none', /* STRICT RULE: NO GLOWING BOX SHADOW */
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000000',
              transition: 'transform var(--duration-fast) var(--ease-out)',
            }}
          >
            <Zap size={22} strokeWidth={2.6} />
          </button>
        </div>

        {/* Tab 3: Challenges */}
        <button
          onClick={() => navigate(navItems[2].path)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            flex: 1,
            color: isActive(navItems[2].path) ? 'var(--color-accent)' : 'var(--color-text-muted)',
            transition: 'color var(--duration-fast) var(--ease-out)',
          }}
        >
          <Trophy size={20} strokeWidth={isActive(navItems[2].path) ? 2.5 : 1.8} />
          <span style={{ fontSize: '10px', fontWeight: isActive(navItems[2].path) ? 700 : 500 }}>
            {navItems[2].label}
          </span>
        </button>

        {/* Tab 4: Profile */}
        <button
          onClick={() => navigate(navItems[3].path)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            flex: 1,
            color: isActive(navItems[3].path) ? 'var(--color-accent)' : 'var(--color-text-muted)',
            transition: 'color var(--duration-fast) var(--ease-out)',
          }}
        >
          <User size={20} strokeWidth={isActive(navItems[3].path) ? 2.5 : 1.8} />
          <span style={{ fontSize: '10px', fontWeight: isActive(navItems[3].path) ? 700 : 500 }}>
            {navItems[3].label}
          </span>
        </button>
      </nav>
    </>
  );
}

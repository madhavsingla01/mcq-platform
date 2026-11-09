import React from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Layers,
  ShieldAlert,
  FileText,
  Activity,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import './AdminLayout.css';

export default function AdminLayout() {
  const { user } = useAuthStore();

  const navItems = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/users', label: 'Users & Roles', icon: Users },
    { to: '/admin/content', label: 'Quizzes & Challenges', icon: Layers },
    { to: '/admin/reports', label: 'Moderation Queue', icon: ShieldAlert },
    { to: '/admin/audit-logs', label: 'Audit Trail', icon: FileText },
    { to: '/admin/system', label: 'System Health', icon: Activity },
  ];

  return (
    <div className="admin-shell">
      {/* Sticky Topbar */}
      <div className="admin-topbar" role="group" aria-label="Control Center actions">
        <div className="admin-topbar-left">
          <Link to="/admin" className="admin-logo-mark">
            <div className="admin-logo-badge">Q</div>
            <span className="admin-logo-title">QuizFocus</span>
          </Link>
          <span className="admin-control-pill">Control Center</span>
        </div>

        <div className="admin-topbar-right">
          <div className="admin-user-pill">
            <span className="admin-live-dot" title="Operational" />
            <ShieldCheck size={16} color="var(--admin-accent)" />
            <span>{user?.name || user?.username || 'Administrator'}</span>
            <span style={{ color: 'var(--admin-text-subtle)' }}>({user?.role || 'admin'})</span>
          </div>

          <Link to="/dashboard" className="admin-exit-btn">
            <span>Exit to App</span>
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>

      {/* Main Body */}
      <div className="admin-body">
        {/* Left Sidebar */}
        <aside className="admin-sidebar">
          <div className="admin-nav-group">
            <div className="admin-nav-header">Management</div>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `admin-nav-item ${isActive ? 'active' : ''}`
                  }
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>

          <div className="admin-sidebar-footer">
            <div className="admin-system-status-indicator">
              <span className="admin-live-dot" />
              <span>9 Microservices Connected</span>
            </div>
          </div>
        </aside>

        {/* Content View */}
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

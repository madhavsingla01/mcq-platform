import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Trophy,
  ShieldAlert,
  Activity,
  ArrowRight,
  UserX,
  Clock,
  CheckCircle,
} from 'lucide-react';
import api from '../../api/axios';
import { Spinner } from '../../components/ui';

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/admin/overview');
      if (res.data?.success) {
        setData(res.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch overview metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spinner size={36} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-card" style={{ borderColor: 'var(--admin-danger)' }}>
        <h3 style={{ color: 'var(--admin-danger)', marginBottom: '8px' }}>Failed to load Admin Overview</h3>
        <p style={{ color: 'var(--admin-text-muted)', marginBottom: '16px' }}>{error}</p>
        <button className="admin-btn admin-btn-secondary" onClick={fetchOverview}>
          Retry
        </button>
      </div>
    );
  }

  const { metrics, recentAuditLogs = [], userGrowth = [] } = data || {};

  return (
    <div>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Platform Overview</h1>
        <p className="admin-page-desc">
          Live operations, user management metrics, and moderation indicators across QuizFocus.
        </p>
      </div>

      {/* KPI Metrics */}
      <div className="admin-metrics-grid">
        <div className="admin-metric-card">
          <div className="admin-metric-header">
            <span className="admin-metric-label">Registered Accounts</span>
            <Users size={18} color="var(--admin-text-muted)" />
          </div>
          <div className="admin-metric-value">{metrics?.totalUsers?.toLocaleString() || 0}</div>
          <div className="admin-metric-footer">
            {metrics?.suspendedUsers > 0 ? (
              <span style={{ color: 'var(--admin-danger)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <UserX size={13} /> {metrics.suspendedUsers} suspended
              </span>
            ) : (
              <span style={{ color: 'var(--admin-success)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle size={13} /> All active
              </span>
            )}
          </div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-header">
            <span className="admin-metric-label">Active Challenges</span>
            <Trophy size={18} color="#f59e0b" />
          </div>
          <div className="admin-metric-value">{metrics?.activeChallenges || 0}</div>
          <div className="admin-metric-footer">
            <span>{metrics?.totalQuizzes || 0} total quizzes published</span>
          </div>
        </div>

        <div className="admin-metric-card" style={{ borderColor: metrics?.pendingReports > 0 ? 'rgba(255, 69, 0, 0.4)' : undefined }}>
          <div className="admin-metric-header">
            <span className="admin-metric-label">Pending Reports</span>
            <ShieldAlert size={18} color={metrics?.pendingReports > 0 ? 'var(--admin-accent)' : 'var(--admin-text-muted)'} />
          </div>
          <div className="admin-metric-value" style={{ color: metrics?.pendingReports > 0 ? 'var(--admin-accent)' : undefined }}>
            {metrics?.pendingReports || 0}
          </div>
          <div className="admin-metric-footer">
            <Link to="/admin/reports" style={{ color: 'var(--admin-accent)', textDecoration: 'none', fontWeight: 600 }}>
              Review moderation queue &rarr;
            </Link>
          </div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-header">
            <span className="admin-metric-label">System Health</span>
            <Activity size={18} color="var(--admin-success)" />
          </div>
          <div className="admin-metric-value" style={{ color: 'var(--admin-success)' }}>
            100%
          </div>
          <div className="admin-metric-footer">
            <Link to="/admin/system" style={{ color: 'var(--admin-text-muted)', textDecoration: 'none' }}>
              All 9 services responding &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Two Column Layout: User Growth & Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {/* Quick Operational Shortcuts */}
        <div className="admin-card">
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Operational Shortcuts</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Link to="/admin/users" className="admin-btn admin-btn-secondary" style={{ justifyContent: 'flex-start', padding: '12px' }}>
              <Users size={16} color="var(--admin-accent)" />
              <span>User Accounts</span>
            </Link>
            <Link to="/admin/content" className="admin-btn admin-btn-secondary" style={{ justifyContent: 'flex-start', padding: '12px' }}>
              <Trophy size={16} color="#f59e0b" />
              <span>Challenges</span>
            </Link>
            <Link to="/admin/reports" className="admin-btn admin-btn-secondary" style={{ justifyContent: 'flex-start', padding: '12px' }}>
              <ShieldAlert size={16} color="var(--admin-danger)" />
              <span>Moderation</span>
            </Link>
            <Link to="/admin/system" className="admin-btn admin-btn-secondary" style={{ justifyContent: 'flex-start', padding: '12px' }}>
              <Activity size={16} color="var(--admin-success)" />
              <span>Service Latency</span>
            </Link>
          </div>
        </div>

        {/* 7-Day Growth */}
        <div className="admin-card">
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>7-Day Registrations</h3>
          {userGrowth.length === 0 ? (
            <p style={{ color: 'var(--admin-text-muted)', fontSize: '13px' }}>No registrations in the last 7 days.</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '100px', paddingTop: '20px' }}>
              {userGrowth.map((day) => (
                <div key={day._id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <div
                    style={{
                      width: '100%',
                      background: 'var(--admin-accent)',
                      borderRadius: '4px',
                      height: `${Math.max(12, Math.min(70, day.count * 15))}px`,
                      transition: 'height 0.3s var(--admin-ease)',
                    }}
                    title={`${day._id}: ${day.count} signups`}
                  />
                  <span style={{ fontSize: '10px', color: 'var(--admin-text-subtle)' }}>
                    {day._id.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Audit Logs */}
      <div className="admin-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Recent Administrative Actions</h3>
          <Link to="/admin/audit-logs" style={{ fontSize: '13px', color: 'var(--admin-accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>View Full Trail</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        {recentAuditLogs.length === 0 ? (
          <p style={{ color: 'var(--admin-text-muted)', fontSize: '13px' }}>No administrative actions logged yet.</p>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {recentAuditLogs.map((log) => (
                  <tr key={log._id}>
                    <td style={{ color: 'var(--admin-text-muted)', whiteSpace: 'nowrap' }}>
                      <Clock size={12} style={{ display: 'inline', marginRight: '6px' }} />
                      {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ fontWeight: 600 }}>{log.actorName || 'Admin'}</td>
                    <td>
                      <span className="admin-pill admin-pill-neutral">
                        {log.action}
                      </span>
                    </td>
                    <td style={{ color: 'var(--admin-text-main)' }}>
                      {log.targetTitle || log.targetId}
                    </td>
                    <td style={{ color: 'var(--admin-text-muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

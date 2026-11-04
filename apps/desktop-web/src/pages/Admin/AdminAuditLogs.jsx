import React, { useEffect, useState, useCallback } from 'react';
import {
  FileText,
  Clock,
  User,
  ChevronDown,
  ChevronUp,
  Shield,
  Layers,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../api/axios';
import { Spinner } from '../../components/ui';

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');
  const [targetTypeFilter, setTargetTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedLogId, setExpandedLogId] = useState(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 25,
        action: actionFilter,
        targetType: targetTypeFilter,
      };
      const res = await api.get('/admin/audit-logs', { params });
      if (res.data?.success) {
        setLogs(res.data.data.logs);
        setTotalPages(res.data.data.pagination.totalPages);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, targetTypeFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getActionBadgeClass = (action) => {
    if (action.includes('suspend') || action.includes('restrict')) return 'admin-pill-suspended';
    if (action.includes('restore')) return 'admin-pill-active';
    if (action.includes('report')) return 'admin-pill-warning';
    return 'admin-pill-neutral';
  };

  return (
    <div>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Audit Trail</h1>
        <p className="admin-page-desc">
          Append-only, immutable historical log of all administrative actions, suspensions, and content restrictions.
        </p>
      </div>

      {/* Filters */}
      <div className="admin-card" style={{ marginBottom: '24px', padding: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="admin-input"
            style={{ height: '40px' }}
          >
            <option value="all">All Actions</option>
            <option value="user_suspend">User Suspension</option>
            <option value="user_restore">User Restoration</option>
            <option value="user_role_change">Role Change</option>
            <option value="content_restrict">Content Restriction</option>
            <option value="content_restore">Content Restoration</option>
            <option value="report_action_taken">Report Action Taken</option>
            <option value="report_dismissed">Report Dismissed</option>
          </select>

          <select
            value={targetTypeFilter}
            onChange={(e) => {
              setTargetTypeFilter(e.target.value);
              setPage(1);
            }}
            className="admin-input"
            style={{ height: '40px' }}
          >
            <option value="all">All Targets</option>
            <option value="user">Users</option>
            <option value="quiz">Quizzes</option>
            <option value="challenge">Challenges</option>
            <option value="report">Reports</option>
            <option value="system">System</option>
          </select>
        </div>
      </div>

      {/* Audit Logs Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={36} />
        </div>
      ) : logs.length === 0 ? (
        <div className="admin-card" style={{ textAlign: 'center', padding: '48px' }}>
          <FileText size={32} color="var(--admin-text-subtle)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '16px', color: 'var(--admin-text-main)', marginBottom: '6px' }}>No audit records found</h3>
          <p style={{ color: 'var(--admin-text-muted)', fontSize: '13px' }}>Actions taken by moderators will be permanently listed here.</p>
        </div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Reason / Justification</th>
                <th>IP</th>
                <th style={{ width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <React.Fragment key={log._id}>
                  <tr
                    onClick={() => setExpandedLogId(expandedLogId === log._id ? null : log._id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ color: 'var(--admin-text-muted)', whiteSpace: 'nowrap' }}>
                      <Clock size={12} style={{ display: 'inline', marginRight: '6px' }} />
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      <div>{log.actorName || 'Admin'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--admin-text-subtle)' }}>{log.actorEmail}</div>
                    </td>
                    <td>
                      <span className={`admin-pill ${getActionBadgeClass(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {log.targetType === 'user' ? <User size={13} color="var(--admin-accent)" /> : <Layers size={13} color="#f59e0b" />}
                        <span style={{ fontWeight: 500 }}>{log.targetTitle || log.targetId}</span>
                        <span style={{ fontSize: '11px', color: 'var(--admin-text-subtle)' }}>({log.targetType})</span>
                      </div>
                    </td>
                    <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--admin-text-main)' }}>
                      {log.reason}
                    </td>
                    <td style={{ color: 'var(--admin-text-subtle)', fontFamily: 'monospace', fontSize: '12px' }}>
                      {log.ipAddress || '127.0.0.1'}
                    </td>
                    <td>
                      {expandedLogId === log._id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </td>
                  </tr>

                  {/* Expanded Metadata Row */}
                  {expandedLogId === log._id && (
                    <tr>
                      <td colSpan={7} style={{ background: '#070707', padding: '16px 20px', borderBottom: '1px solid var(--admin-border)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: '8px' }}>
                          IMMUTABLE AUDIT SNAPSHOT & METADATA (RECORD ID: {log._id})
                        </div>
                        <pre
                          style={{
                            background: '#000000',
                            border: '1px solid var(--admin-border)',
                            borderRadius: '8px',
                            padding: '12px',
                            fontSize: '12px',
                            color: '#10b981',
                            fontFamily: 'monospace',
                            overflowX: 'auto',
                            maxHeight: '200px',
                          }}
                        >
                          {JSON.stringify(
                            {
                              actorId: log.actorId,
                              action: log.action,
                              targetType: log.targetType,
                              targetId: log.targetId,
                              reason: log.reason,
                              ipAddress: log.ipAddress,
                              metadata: log.metadata,
                              createdAt: log.createdAt,
                            },
                            null,
                            2
                          )}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
          <button
            className="admin-btn admin-btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span style={{ fontSize: '13px', color: 'var(--admin-text-muted)' }}>
            Page {page} of {totalPages}
          </span>
          <button
            className="admin-btn admin-btn-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

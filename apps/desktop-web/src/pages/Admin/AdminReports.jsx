import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldAlert,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Layers,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../api/axios';
import { Spinner } from '../../components/ui';

export default function AdminReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Resolution Modal State
  const [selectedReport, setSelectedReport] = useState(null);
  const [resolveAction, setResolveAction] = useState('dismissed');
  const [resolveNotes, setResolveNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 20,
        status: statusFilter,
        category: categoryFilter,
      };
      const res = await api.get('/admin/reports', { params });
      if (res.data?.success) {
        setReports(res.data.data.reports);
        setTotalPages(res.data.data.pagination.totalPages);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, categoryFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleQuickDismiss = async (report) => {
    try {
      const res = await api.post(`/admin/reports/${report._id}/resolve`, {
        status: 'dismissed',
        action: 'dismissed',
        notes: 'Dismissed by moderator as benign or false report.',
      });
      if (res.data?.success) {
        toast.success(`Report #${report._id.slice(-6)} dismissed.`);
        fetchReports();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to dismiss report');
    }
  };

  const handleResolveSubmit = async (e) => {
    e.preventDefault();
    if (!selectedReport) return;

    try {
      setActionLoading(true);
      const res = await api.post(`/admin/reports/${selectedReport._id}/resolve`, {
        status: resolveAction === 'dismissed' ? 'dismissed' : 'action_taken',
        action: resolveAction,
        notes: resolveNotes.trim(),
      });
      if (res.data?.success) {
        toast.success(`Report resolved with action '${resolveAction}'.`);
        setSelectedReport(null);
        setResolveNotes('');
        fetchReports();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resolve report');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Moderation Queue</h1>
        <p className="admin-page-desc">
          Review community reports regarding offensive questions, harassment, spam, and challenge integrity.
        </p>
      </div>

      {/* Tabs & Filters */}
      <div className="admin-card" style={{ marginBottom: '24px', padding: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { id: 'pending', label: 'Pending' },
              { id: 'in_review', label: 'In Review' },
              { id: 'action_taken', label: 'Action Taken' },
              { id: 'dismissed', label: 'Dismissed' },
              { id: 'all', label: 'All Reports' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.id);
                  setPage(1);
                }}
                className={`admin-btn ${statusFilter === tab.id ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                style={{ padding: '6px 12px' }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="admin-input"
            style={{ height: '40px' }}
          >
            <option value="all">All Categories</option>
            <option value="spam">Spam</option>
            <option value="harassment">Harassment</option>
            <option value="inappropriate">Inappropriate</option>
            <option value="impersonation">Impersonation</option>
            <option value="cheating">Cheating</option>
            <option value="copyright">Copyright / DMCA</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* Reports List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={36} />
        </div>
      ) : reports.length === 0 ? (
        <div className="admin-card" style={{ textAlign: 'center', padding: '48px' }}>
          <CheckCircle size={32} color="var(--admin-success)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '16px', color: 'var(--admin-text-main)', marginBottom: '6px' }}>Queue is clean</h3>
          <p style={{ color: 'var(--admin-text-muted)', fontSize: '13px' }}>
            There are no reports matching this filter.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {reports.map((report) => (
            <div
              key={report._id}
              className="admin-card"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '20px',
                padding: '20px',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span className="admin-pill admin-pill-warning" style={{ textTransform: 'uppercase', fontSize: '11px' }}>
                    {report.category}
                  </span>
                  <span className={`admin-pill ${report.status === 'pending' ? 'admin-pill-suspended' : 'admin-pill-neutral'}`}>
                    {report.status.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--admin-text-subtle)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} />
                    {new Date(report.createdAt).toLocaleString()}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  {report.targetType === 'user' ? (
                    <User size={15} color="var(--admin-accent)" />
                  ) : (
                    <Layers size={15} color="#f59e0b" />
                  )}
                  <span style={{ fontWeight: 600, fontSize: '14.5px', color: 'var(--admin-text-main)' }}>
                    Target: {report.targetTitle || report.targetId} ({report.targetType})
                  </span>
                </div>

                <p style={{ fontSize: '13.5px', color: 'var(--admin-text-main)', marginBottom: '6px' }}>
                  <strong>Report Reason:</strong> {report.reason}
                </p>

                {report.description && (
                  <p style={{ fontSize: '13px', color: 'var(--admin-text-muted)', marginBottom: '8px', background: 'var(--admin-surface-elevated)', padding: '8px 12px', borderRadius: '8px' }}>
                    "{report.description}"
                  </p>
                )}

                <div style={{ fontSize: '12px', color: 'var(--admin-text-subtle)' }}>
                  Reported by: @{report.reporterName || 'Anonymous'}
                  {report.resolvedBy && (
                    <span style={{ marginLeft: '12px', color: 'var(--admin-success)' }}>
                      • Resolved by {report.resolvedByName || 'Admin'} ({report.resolutionAction})
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              {report.status === 'pending' || report.status === 'in_review' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '130px' }}>
                  <button
                    type="button"
                    className="admin-btn admin-btn-primary"
                    style={{ fontSize: '12.5px', padding: '6px 12px' }}
                    onClick={() => {
                      setSelectedReport(report);
                      setResolveAction(report.targetType === 'user' ? 'suspended' : 'restricted');
                    }}
                  >
                    Take Action
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary"
                    style={{ fontSize: '12.5px', padding: '6px 12px' }}
                    onClick={() => handleQuickDismiss(report)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
            </div>
          ))}
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

      {/* Resolution Action Modal */}
      {selectedReport && (
        <div className="admin-modal-overlay" onClick={() => setSelectedReport(null)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldAlert size={20} color="var(--admin-accent)" />
                <h3 style={{ fontSize: '17px', fontWeight: 700 }}>Resolve Moderation Report</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                style={{ background: 'none', border: 'none', color: 'var(--admin-text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13.5px', color: 'var(--admin-text-muted)', marginBottom: '16px' }}>
              Select the administrative outcome for report on <strong style={{ color: 'var(--admin-text-main)' }}>{selectedReport.targetTitle || selectedReport.targetId}</strong>.
            </p>

            <form onSubmit={handleResolveSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: '6px' }}>
                  ADMINISTRATIVE ACTION
                </label>
                <select
                  value={resolveAction}
                  onChange={(e) => setResolveAction(e.target.value)}
                  className="admin-input"
                  style={{ width: '100%', height: '40px' }}
                >
                  <option value="dismissed">Dismiss Report (No Violation)</option>
                  {selectedReport.targetType === 'quiz' || selectedReport.targetType === 'challenge' ? (
                    <option value="restricted">Restrict Content from Public Discovery</option>
                  ) : null}
                  {selectedReport.targetType === 'user' ? (
                    <option value="suspended">Suspend User Account</option>
                  ) : null}
                  <option value="warned">Log Warning (No Immediate State Change)</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: '6px' }}>
                  RESOLUTION NOTES (AUDITED)
                </label>
                <textarea
                  className="admin-input"
                  style={{ width: '100%', minHeight: '80px', resize: 'vertical' }}
                  placeholder="Explain why this moderation outcome was reached..."
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setSelectedReport(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-btn admin-btn-primary"
                  disabled={actionLoading || !resolveNotes.trim()}
                >
                  {actionLoading ? 'Applying...' : 'Apply Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

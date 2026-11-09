import React, { useEffect, useState, useCallback } from 'react';
import {
  Search,
  Trophy,
  Layers,
  EyeOff,
  Eye,
  AlertTriangle,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { showCustomDialog } from '../../components/ui/CustomDialog';
import api from '../../api/axios';
import { Spinner } from '../../components/ui';

export default function AdminContent() {
  const [content, setContent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const [restrictedFilter, setRestrictedFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [copiedCode, setCopiedCode] = useState(null);

  // Modal State
  const [restrictModalItem, setRestrictModalItem] = useState(null);
  const [restrictReason, setRestrictReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchContent = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 20,
        search: search.trim(),
        type: typeFilter,
        visibility: visibilityFilter,
        restricted: restrictedFilter,
      };
      const res = await api.get('/admin/content', { params });
      if (res.data?.success) {
        setContent(res.data.data.content);
        setTotalPages(res.data.data.pagination.totalPages);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch content');
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter, visibilityFilter, restrictedFilter]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const copyCode = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Copied ${code} to clipboard`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleRestrict = async (e) => {
    e.preventDefault();
    if (!restrictModalItem) return;
    if (!restrictReason.trim()) {
      toast.error('A reason is required to restrict content.');
      return;
    }

    try {
      setActionLoading(true);
      const res = await api.post(`/admin/content/${restrictModalItem._id}/restrict`, {
        reason: restrictReason.trim(),
      });
      if (res.data?.success) {
        toast.success(`"${restrictModalItem.title}" has been restricted from public discovery.`);
        setRestrictModalItem(null);
        setRestrictReason('');
        fetchContent();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to restrict content');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestore = async (item) => {
    const confirmed = await showCustomDialog({
      title: 'Restore Visibility',
      message: `Restore public visibility for "${item.title}"?`,
      type: 'info',
      confirmText: 'Restore Visibility',
      cancelText: 'Cancel',
    });
    if (!confirmed) {
      return;
    }

    try {
      setActionLoading(true);
      const res = await api.post(`/admin/content/${item._id}/restore`, {
        reason: 'Restored via Admin Control Center',
      });
      if (res.data?.success) {
        toast.success(`"${item.title}" visibility restored.`);
        fetchContent();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to restore content');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Quizzes & Challenges</h1>
        <p className="admin-page-desc">
          Audit user-created quizzes, monitor challenge participation, and manage public discovery restrictions.
        </p>
      </div>

      {/* Filter & Search Bar */}
      <div className="admin-card" style={{ marginBottom: '24px', padding: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1', minWidth: '260px' }}>
            <Search size={16} color="var(--admin-text-subtle)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search by title, !QZ-..., or tags..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="admin-input"
              style={{ width: '100%', paddingLeft: '38px', height: '40px' }}
            />
          </div>

          {/* Type Filter */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {['all', 'quiz', 'challenge'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setTypeFilter(type);
                  setPage(1);
                }}
                className={`admin-btn ${typeFilter === type ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                style={{ textTransform: 'capitalize', padding: '6px 12px' }}
              >
                {type === 'all' ? 'All Types' : type === 'quiz' ? 'Quizzes' : 'Challenges'}
              </button>
            ))}
          </div>

          {/* Visibility & Moderation Filter */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <select
              value={visibilityFilter}
              onChange={(e) => {
                setVisibilityFilter(e.target.value);
                setPage(1);
              }}
              className="admin-input"
              style={{ height: '40px' }}
            >
              <option value="all">All Visibility</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
            </select>

            <select
              value={restrictedFilter}
              onChange={(e) => {
                setRestrictedFilter(e.target.value);
                setPage(1);
              }}
              className="admin-input"
              style={{ height: '40px' }}
            >
              <option value="all">All Status</option>
              <option value="false">Active Only</option>
              <option value="true">Restricted Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={36} />
        </div>
      ) : content.length === 0 ? (
        <div className="admin-card" style={{ textAlign: 'center', padding: '48px' }}>
          <Layers size={32} color="var(--admin-text-subtle)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '16px', color: 'var(--admin-text-main)', marginBottom: '6px' }}>No content found</h3>
          <p style={{ color: 'var(--admin-text-muted)', fontSize: '13px' }}>Try relaxing your search terms or filters.</p>
        </div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title & Code</th>
                <th>Type</th>
                <th>Creator</th>
                <th>Questions</th>
                <th>Attempts</th>
                <th>Visibility</th>
                <th>Moderation</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {content.map((item) => (
                <tr key={item._id}>
                  <td>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--admin-text-main)', marginBottom: '3px' }}>
                        {item.title}
                      </div>
                      {item.quizCode && (
                        <button
                          type="button"
                          onClick={() => copyCode(item.quizCode)}
                          className="admin-pill admin-pill-neutral"
                          style={{
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                          }}
                          title="Click to copy symbolic code"
                        >
                          {copiedCode === item.quizCode ? <Check size={11} color="var(--admin-success)" /> : <Copy size={11} />}
                          <span>{item.quizCode}</span>
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    {item.isChallenge ? (
                      <span className="admin-pill admin-pill-warning">
                        <Trophy size={11} /> Challenge
                      </span>
                    ) : (
                      <span className="admin-pill admin-pill-neutral">
                        <Layers size={11} /> Quiz
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: '13px', color: 'var(--admin-text-muted)' }}>
                      @{item.uploaderDetails?.username || 'user'}
                    </div>
                  </td>
                  <td style={{ color: 'var(--admin-text-main)' }}>{item.totalQuestions || 0}</td>
                  <td style={{ color: 'var(--admin-text-muted)' }}>{item.totalAttempts || 0}</td>
                  <td>
                    <span className="admin-pill admin-pill-neutral" style={{ textTransform: 'capitalize' }}>
                      {item.visibility || 'public'}
                    </span>
                  </td>
                  <td>
                    {item.isRestricted ? (
                      <span className="admin-pill admin-pill-suspended" title={item.restrictedReason || 'Restricted'}>
                        <EyeOff size={11} /> Restricted
                      </span>
                    ) : (
                      <span className="admin-pill admin-pill-active">
                        <Eye size={11} /> Normal
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {item.isRestricted ? (
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        style={{ padding: '5px 10px', fontSize: '12px' }}
                        onClick={() => handleRestore(item)}
                        disabled={actionLoading}
                      >
                        <Eye size={13} color="var(--admin-success)" />
                        <span>Restore</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="admin-btn admin-btn-danger"
                        style={{ padding: '5px 10px', fontSize: '12px' }}
                        onClick={() => setRestrictModalItem(item)}
                        disabled={actionLoading}
                      >
                        <EyeOff size={13} />
                        <span>Restrict</span>
                      </button>
                    )}
                  </td>
                </tr>
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

      {/* Restrict Confirmation Modal */}
      {restrictModalItem && (
        <div className="admin-modal-overlay" onClick={() => setRestrictModalItem(null)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={20} color="var(--admin-danger)" />
                <h3 style={{ fontSize: '17px', fontWeight: 700 }}>Restrict Content from Public Discovery</h3>
              </div>
              <button
                type="button"
                onClick={() => setRestrictModalItem(null)}
                style={{ background: 'none', border: 'none', color: 'var(--admin-text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13.5px', color: 'var(--admin-text-muted)', marginBottom: '16px' }}>
              Restricting <strong style={{ color: 'var(--admin-text-main)' }}>"{restrictModalItem.title}"</strong> ({restrictModalItem.quizCode}) will immediately hide it from Explore feeds, search results, and challenge arenas.
            </p>

            <form onSubmit={handleRestrict}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: '6px' }}>
                  OPERATIONAL REASON (MANDATORY & AUDITED)
                </label>
                <textarea
                  className="admin-input"
                  style={{ width: '100%', minHeight: '90px', resize: 'vertical' }}
                  placeholder="e.g. Inappropriate content reported, copyright complaint, malicious questions..."
                  value={restrictReason}
                  onChange={(e) => setRestrictReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setRestrictModalItem(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-btn admin-btn-danger"
                  disabled={actionLoading || !restrictReason.trim()}
                >
                  {actionLoading ? 'Restricting...' : 'Confirm Restriction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState, useCallback } from 'react';
import {
  Search,
  UserCheck,
  UserX,
  Shield,
  ShieldAlert,
  AlertCircle,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { showCustomDialog } from '../../components/ui/CustomDialog';
import api from '../../api/axios';
import { Spinner } from '../../components/ui';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modal State
  const [suspendModalUser, setSuspendModalUser] = useState(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 20,
        search: search.trim(),
        status: statusFilter,
        role: roleFilter,
      };
      const res = await api.get('/admin/users', { params });
      if (res.data?.success) {
        setUsers(res.data.data.users);
        setTotalPages(res.data.data.pagination.totalPages);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSuspend = async (e) => {
    e.preventDefault();
    if (!suspendModalUser) return;
    if (!suspendReason.trim()) {
      toast.error('A valid operational reason is required for suspension.');
      return;
    }

    try {
      setActionLoading(true);
      const res = await api.post(`/admin/users/${suspendModalUser._id}/suspend`, {
        reason: suspendReason.trim(),
      });
      if (res.data?.success) {
        toast.success(`Account ${suspendModalUser.username || suspendModalUser.email} has been suspended.`);
        setSuspendModalUser(null);
        setSuspendReason('');
        fetchUsers();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to suspend user');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestore = async (user) => {
    const confirmed = await showCustomDialog({
      title: 'Restore User Account',
      message: `Are you sure you want to restore ${user.username || user.email}?`,
      type: 'info',
      confirmText: 'Restore Account',
      cancelText: 'Cancel',
    });
    if (!confirmed) {
      return;
    }

    try {
      setActionLoading(true);
      const res = await api.post(`/admin/users/${user._id}/restore`, {
        reason: 'Restored via Admin Control Center',
      });
      if (res.data?.success) {
        toast.success(`Account ${user.username || user.email} restored successfully.`);
        fetchUsers();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to restore user');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleRole = async (user) => {
    const nextRole = user.role === 'admin' ? 'user' : 'admin';
    const confirmed = await showCustomDialog({
      title: 'Change User Role',
      message: `Change role for ${user.username || user.email} to '${nextRole}'?`,
      type: 'warning',
      confirmText: `Change to ${nextRole}`,
      cancelText: 'Cancel',
    });
    if (!confirmed) {
      return;
    }

    try {
      const res = await api.post(`/admin/users/${user._id}/role`, {
        role: nextRole,
        reason: 'Role updated via Admin Control Center',
      });
      if (res.data?.success) {
        toast.success(`User role updated to ${nextRole}`);
        fetchUsers();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update user role');
    }
  };

  return (
    <div>
      <div className="admin-page-header">
        <h1 className="admin-page-title">User Management</h1>
        <p className="admin-page-desc">
          Search, audit, inspect roles, and execute suspensions across all QuizFocus user accounts.
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
              placeholder="Search by name, email, username, or USR-..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="admin-input"
              style={{ width: '100%', paddingLeft: '38px', height: '40px' }}
            />
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {['all', 'active', 'suspended'].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  setStatusFilter(status);
                  setPage(1);
                }}
                className={`admin-btn ${statusFilter === status ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                style={{ textTransform: 'capitalize', padding: '6px 12px' }}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="admin-input"
            style={{ height: '40px' }}
          >
            <option value="all">All Roles</option>
            <option value="user">Standard Users</option>
            <option value="admin">Administrators</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={36} />
        </div>
      ) : users.length === 0 ? (
        <div className="admin-card" style={{ textAlign: 'center', padding: '48px' }}>
          <AlertCircle size={32} color="var(--admin-text-subtle)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '16px', color: 'var(--admin-text-main)', marginBottom: '6px' }}>No users matched your criteria</h3>
          <p style={{ color: 'var(--admin-text-muted)', fontSize: '13px' }}>Try adjusting your search terms or filters.</p>
        </div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User Account</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: 'var(--admin-surface-elevated)',
                          border: '1px solid var(--admin-border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '13px',
                          color: 'var(--admin-accent)',
                        }}
                      >
                        {(u.name || u.username || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{u.name || 'Unnamed'}</div>
                        <div style={{ fontSize: '12px', color: 'var(--admin-text-muted)' }}>
                          @{u.username || 'user'} {u.userCode && <span style={{ color: 'var(--admin-text-subtle)' }}>({u.userCode})</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: 'var(--admin-text-muted)' }}>{u.email}</td>
                  <td>
                    <span className={`admin-pill ${u.role === 'admin' ? 'admin-pill-warning' : 'admin-pill-neutral'}`}>
                      <Shield size={11} /> {u.role}
                    </span>
                  </td>
                  <td>
                    {u.isSuspended ? (
                      <span className="admin-pill admin-pill-suspended" title={u.suspensionReason || 'Suspended'}>
                        <UserX size={12} /> Suspended
                      </span>
                    ) : (
                      <span className="admin-pill admin-pill-active">
                        <UserCheck size={12} /> Active
                      </span>
                    )}
                  </td>
                  <td style={{ color: 'var(--admin-text-subtle)', fontSize: '12.5px' }}>
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      {u.isSuspended ? (
                        <button
                          type="button"
                          className="admin-btn admin-btn-secondary"
                          style={{ padding: '5px 10px', fontSize: '12px' }}
                          onClick={() => handleRestore(u)}
                          disabled={actionLoading}
                        >
                          <UserCheck size={13} color="var(--admin-success)" />
                          <span>Restore</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="admin-btn admin-btn-danger"
                          style={{ padding: '5px 10px', fontSize: '12px' }}
                          onClick={() => setSuspendModalUser(u)}
                          disabled={actionLoading}
                        >
                          <UserX size={13} />
                          <span>Suspend</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        style={{ padding: '5px 8px', fontSize: '12px' }}
                        onClick={() => handleToggleRole(u)}
                        title={`Toggle Role (Current: ${u.role})`}
                      >
                        {u.role === 'admin' ? 'Demote' : 'Make Admin'}
                      </button>
                    </div>
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

      {/* Suspend Confirmation Modal */}
      {suspendModalUser && (
        <div className="admin-modal-overlay" onClick={() => setSuspendModalUser(null)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldAlert size={20} color="var(--admin-danger)" />
                <h3 style={{ fontSize: '17px', fontWeight: 700 }}>Suspend User Account</h3>
              </div>
              <button
                type="button"
                onClick={() => setSuspendModalUser(null)}
                style={{ background: 'none', border: 'none', color: 'var(--admin-text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13.5px', color: 'var(--admin-text-muted)', marginBottom: '16px' }}>
              You are suspending <strong style={{ color: 'var(--admin-text-main)' }}>{suspendModalUser.username || suspendModalUser.email}</strong>.
              They will immediately be blocked from taking quizzes, submitting attempts, and accessing the platform.
            </p>

            <form onSubmit={handleSuspend}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: '6px' }}>
                  OPERATIONAL REASON (MANDATORY & AUDITED)
                </label>
                <textarea
                  className="admin-input"
                  style={{ width: '100%', minHeight: '90px', resize: 'vertical' }}
                  placeholder="e.g. Repeated spamming, harassment in comments, cheating on timed challenges..."
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setSuspendModalUser(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-btn admin-btn-danger"
                  disabled={actionLoading || !suspendReason.trim()}
                >
                  {actionLoading ? 'Suspending...' : 'Confirm Suspension'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

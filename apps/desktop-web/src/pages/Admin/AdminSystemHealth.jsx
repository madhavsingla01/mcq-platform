import React, { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  Server,
  Database,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../api/axios';
import { Spinner } from '../../components/ui';

export default function AdminSystemHealth() {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = useCallback(async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      else setLoading(true);

      const res = await api.get('/admin/system');
      if (res.data?.success) {
        setHealthData(res.data.data);
        if (isManual) {
          toast.success('Live service diagnostics refreshed');
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to ping microservices');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth(false);
  }, [fetchHealth]);

  const getStatusBadge = (status) => {
    if (status === 'healthy') {
      return (
        <span className="admin-pill admin-pill-active">
          <CheckCircle size={12} /> Healthy
        </span>
      );
    }
    if (status === 'degraded') {
      return (
        <span className="admin-pill admin-pill-warning">
          <AlertTriangle size={12} /> Degraded
        </span>
      );
    }
    return (
      <span className="admin-pill admin-pill-suspended">
        <XCircle size={12} /> Offline
      </span>
    );
  };

  const formatUptime = (seconds) => {
    if (!seconds) return '0m';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <p className="admin-page-desc">
            Real-time ping matrix and latency telemetry across all 9 QuizFocus application microservices.
          </p>
        </div>

        <button
          type="button"
          className="admin-btn admin-btn-secondary"
          onClick={() => fetchHealth(true)}
          disabled={refreshing || loading}
          style={{ gap: '8px' }}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span>{refreshing ? 'Pinging Services...' : 'Ping Services Now'}</span>
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={36} />
        </div>
      ) : !healthData ? (
        <div className="admin-card">Failed to load system diagnostics.</div>
      ) : (
        <>
          {/* Status summary banner */}
          <div
            className="admin-card"
            style={{
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: healthData.overallStatus === 'healthy' ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
              borderColor: healthData.overallStatus === 'healthy' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <Zap size={24} color={healthData.overallStatus === 'healthy' ? 'var(--admin-success)' : 'var(--admin-danger)'} />
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700 }}>
                  System Status: {healthData.overallStatus === 'healthy' ? 'All Microservices Operational' : 'Degraded Performance Detected'}
                </h3>
                <span style={{ fontSize: '13px', color: 'var(--admin-text-muted)' }}>
                  Diagnostics timestamp: {new Date(healthData.timestamp).toLocaleTimeString()} • Process Uptime: {formatUptime(healthData.uptimeSeconds)}
                </span>
              </div>
            </div>

            <span className="admin-live-dot" />
          </div>

          {/* Microservices Grid Table */}
          <div className="admin-card" style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Server size={18} color="var(--admin-accent)" />
              Microservices Grid (9 Services)
            </h3>

            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Service Name</th>
                    <th>Port</th>
                    <th>Status</th>
                    <th>Latency</th>
                    <th>Destination URL</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {healthData.services?.map((svc) => (
                    <tr key={svc.name}>
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: svc.status === 'healthy' ? 'var(--admin-success)' : 'var(--admin-danger)',
                            }}
                          />
                          <span>{svc.name}</span>
                          {svc.self && (
                            <span style={{ fontSize: '10px', color: 'var(--admin-accent)', fontWeight: 700, textTransform: 'uppercase' }}>
                              (Self)
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--admin-text-muted)' }}>:{svc.port}</td>
                      <td>{getStatusBadge(svc.status)}</td>
                      <td>
                        {svc.latencyMs !== null ? (
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              color: svc.latencyMs < 50 ? 'var(--admin-success)' : svc.latencyMs < 200 ? 'var(--admin-warning)' : 'var(--admin-danger)',
                            }}
                          >
                            {svc.latencyMs} ms
                          </span>
                        ) : (
                          <span style={{ color: 'var(--admin-text-subtle)' }}>—</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--admin-text-subtle)', fontFamily: 'monospace', fontSize: '12px' }}>
                        {svc.url}
                      </td>
                      <td style={{ color: 'var(--admin-text-muted)', fontSize: '12.5px' }}>
                        {svc.error || (svc.details?.memoryUsageMb ? `${svc.details.memoryUsageMb} MB heap` : 'OK')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Databases Section */}
          <div className="admin-card">
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={18} color="#f59e0b" />
              Database Connections
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              {healthData.databases?.map((db) => (
                <div
                  key={db.name}
                  style={{
                    background: 'var(--admin-surface-elevated)',
                    border: '1px solid var(--admin-border)',
                    borderRadius: 'var(--admin-radius-control)',
                    padding: '16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{db.name}</span>
                    <span className={`admin-pill ${db.state === 'connected' ? 'admin-pill-active' : 'admin-pill-suspended'}`}>
                      {db.state}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--admin-text-subtle)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {db.uri}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

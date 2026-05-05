'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { adminApi, AuditLog, getApiError, Paginated } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

function actionClass(action: string): string {
  if (action.includes('success') || action.includes('created')) {
    return 'badge badge-green';
  }

  if (action.includes('fail') || action.includes('revoke')) {
    return 'badge badge-red';
  }

  return 'badge badge-amber';
}

export default function AdminAuditPage() {
  useAuth({ requireAuth: true, requireAdmin: true });
  const [logs, setLogs] = useState<Paginated<AuditLog> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadLogs(nextPage = page) {
    setLoading(true);
    setError('');
    try {
      const data = await adminApi.getAuditLogs({ page: nextPage, limit: 20 });
      setLogs(data);
      setPage(nextPage);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs(1);
  }, []);

  const totalPages = logs ? Math.max(1, Math.ceil(logs.total / logs.limit)) : 1;

  return (
    <section>
      <div className="section-heading">
        <span>Audit</span>
        <h1>Security audit log</h1>
        <p>Track verification outcomes, device events, and license actions.</p>
      </div>

      <div className="card">
        <div className="toolbar">
          <button className="btn btn-outline" onClick={() => void loadLogs(page)}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        {loading ? (
          <div className="loading-row">
            <span className="spinner" /> Loading audit log...
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>License ID</th>
                  <th>Device ID</th>
                  <th>IP</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs?.data.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.createdAt).toLocaleString()}</td>
                    <td>
                      <span className={actionClass(log.action)}>{log.action}</span>
                    </td>
                    <td className="mono">{log.licenseId?.slice(0, 12) ?? '-'}</td>
                    <td className="mono">{log.deviceId?.slice(0, 12) ?? '-'}</td>
                    <td>{log.ipAddress ?? '-'}</td>
                    <td>{log.details ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <button
            className="btn btn-outline"
            disabled={page <= 1}
            onClick={() => void loadLogs(page - 1)}
          >
            Prev
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            className="btn btn-outline"
            disabled={page >= totalPages}
            onClick={() => void loadLogs(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

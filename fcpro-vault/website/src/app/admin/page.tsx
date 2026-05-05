'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { adminApi, AdminStats, getApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export default function AdminPage() {
  const { loading } = useAuth({ requireAuth: true, requireAdmin: true });
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading) {
      adminApi.getStats().then(setStats).catch((err) => setError(getApiError(err)));
    }
  }, [loading]);

  if (loading) {
    return <div className="spinner" />;
  }

  return (
    <div className="fade-up">
      <p className="eyebrow">Command center</p>
      <h1>Admin dashboard</h1>
      {error && <p className="form-error">{error}</p>}
      <div className="stats-grid">
        <Stat label="Total Licenses" value={stats?.totalLicenses ?? 0} />
        <Stat label="Active Licenses" value={stats?.activeLicenses ?? 0} />
        <Stat label="Registered Devices" value={stats?.totalDevices ?? 0} />
        <Stat label="Verifications (24h)" value={stats?.recentVerifications ?? 0} />
      </div>
      <div className="dashboard-grid">
        <Link className="card" href="/admin/licenses">
          <h2>Manage Licenses</h2>
          <p>Search, inspect, and revoke suspicious or expired entitlements.</p>
        </Link>
        <Link className="card" href="/admin/audit">
          <h2>Audit Log</h2>
          <p>Review verification events, device limits, and download issuance trails.</p>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

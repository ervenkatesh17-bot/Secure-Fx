'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { Download, KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { getApiError, LicenseRecord, licenseApi } from '../../lib/api';
import { useAuth } from '../../lib/auth';

function tierBadge(tier: string) {
  if (tier === 'enterprise') return 'badge badge-amber';
  if (tier === 'professional') return 'badge badge-green';
  return 'badge';
}

export default function DashboardOverviewPage() {
  useAuth({ requireAuth: true });
  const [license, setLicense] = useState<LicenseRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    licenseApi
      .getMy()
      .then(setLicense)
      .catch((error) => toast.error(getApiError(error)))
      .finally(() => setLoading(false));
  }, []);

  async function copyLicenseKey() {
    if (!license) return;
    await navigator.clipboard.writeText(license.licenseKey);
    toast.success('License key copied');
  }

  if (loading) {
    return <div className="spinner" />;
  }

  if (!license) {
    return (
      <section className="card fade-up">
        <h1>No license found</h1>
        <p className="muted">Purchase a plan to activate your vault access.</p>
      </section>
    );
  }

  const activeDevices = (license.devices ?? []).filter((device) => device.isActive).length;

  return (
    <div className="stack-lg">
      <section>
        <p className="eyebrow">Overview</p>
        <h1>Your secure project vault</h1>
      </section>

      <section className="dashboard-grid">
        <div className="stat-card">
          <ShieldCheck />
          <span>Status</span>
          <strong className={license.status === 'active' ? 'badge badge-green' : 'badge badge-red'}>
            {license.status}
          </strong>
        </div>
        <div className="stat-card">
          <KeyRound />
          <span>Tier</span>
          <strong className={tierBadge(license.tier)}>{license.tier}</strong>
        </div>
        <div className="stat-card">
          <Smartphone />
          <span>Devices</span>
          <strong>
            {activeDevices}/{license.maxDevices}
          </strong>
        </div>
        <div className="stat-card">
          <Download />
          <span>Verifications</span>
          <strong>{license.verificationCount}</strong>
        </div>
      </section>

      <section className="card">
        <h2>License key</h2>
        <p className="muted">
          Last verified{' '}
          {license.lastVerifiedAt
            ? formatDistanceToNow(new Date(license.lastVerifiedAt), { addSuffix: true })
            : 'never'}
        </p>
        <div className="copy-field">
          <code>{license.licenseKey}</code>
          <button className="btn btn-outline" onClick={copyLicenseKey}>
            Copy
          </button>
        </div>
      </section>

      <section className="card split-card">
        <div>
          <h2>Download FCPro Vault Desktop</h2>
          <p className="muted">
            Open encrypted Final Cut Pro projects through the secure desktop client.
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-amber">Download for macOS</button>
          <button className="btn btn-outline">Download for Windows</button>
        </div>
      </section>
    </div>
  );
}

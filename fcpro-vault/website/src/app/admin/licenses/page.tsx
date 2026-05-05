"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi, getApiError, License, LicenseStatus } from '../../../lib/api';

const statuses = ['', 'active', 'expired', 'suspended', 'revoked'];

function badgeClass(status: string) {
  if (status === 'active') return 'badge badge-green';
  if (status === 'revoked' || status === 'suspended') return 'badge badge-red';
  return 'badge badge-amber';
}

function short(value: string | null | undefined, length = 12) {
  if (!value) return '—';
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

export default function AdminLicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LicenseStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [revokeTarget, setRevokeTarget] = useState<License | null>(null);
  const [reason, setReason] = useState('');
  const limit = 10;
  const pages = Math.max(1, Math.ceil(total / limit));

  const filters = useMemo(
    () => ({ page, limit, search: search || undefined, status: status || undefined }),
    [page, search, status],
  );

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    adminApi
      .getLicenses(filters)
      .then((result) => {
        if (!mounted) return;
        setLicenses(result.data);
        setTotal(result.total);
      })
      .catch((error) => toast.error(getApiError(error)))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [filters]);

  async function submitRevoke(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!revokeTarget || reason.trim().length === 0) return;
    try {
      await adminApi.revokeLicense(revokeTarget.id, reason.trim());
      toast.success('License revoked');
      setRevokeTarget(null);
      setReason('');
      const result = await adminApi.getLicenses(filters);
      setLicenses(result.data);
      setTotal(result.total);
    } catch (error) {
      toast.error(getApiError(error));
    }
  }

  return (
    <section className="fade-up">
      <div className="page-heading">
        <p className="eyebrow">Admin</p>
        <h1>License table</h1>
      </div>
      <div className="card stack">
        <div className="cluster">
          <input
            className="input"
            placeholder="Search email or license key"
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
          />
          <select
            className="input"
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as LicenseStatus | '');
            }}
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item || 'all statuses'}
              </option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>License Key</th>
                <th>Tier</th>
                <th>Status</th>
                <th>Devices</th>
                <th>Last Verified</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>Loading...</td>
                </tr>
              ) : (
                licenses.map((license) => (
                  <tr key={license.id}>
                    <td>{license.email ?? '—'}</td>
                    <td className="mono">{short(license.licenseKey, 18)}</td>
                    <td><span className="badge badge-amber">{license.tier}</span></td>
                    <td><span className={badgeClass(license.status)}>{license.status}</span></td>
                    <td>{license.devices?.filter((device) => device.isActive).length ?? 0}/{license.maxDevices}</td>
                    <td>{license.lastVerifiedAt ? new Date(license.lastVerifiedAt).toLocaleString() : '—'}</td>
                    <td>{new Date(license.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button className="btn btn-danger" onClick={() => setRevokeTarget(license)}>
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="cluster between">
          <button className="btn btn-outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Prev
          </button>
          <span className="muted">Page {page} of {pages}</span>
          <button className="btn btn-outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>
            Next
          </button>
        </div>
      </div>
      {revokeTarget && (
        <div className="modal-backdrop">
          <form className="modal card stack" onSubmit={submitRevoke}>
            <h2>Revoke license</h2>
            <p className="muted">{revokeTarget.licenseKey}</p>
            <textarea
              className="input"
              required
              rows={4}
              placeholder="Reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="cluster">
              <button className="btn btn-danger" type="submit">Revoke</button>
              <button className="btn btn-ghost" type="button" onClick={() => setRevokeTarget(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

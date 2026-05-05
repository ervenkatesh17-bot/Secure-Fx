'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { License, Device, getApiError, licenseApi } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

function osIcon(platform: string | null): string {
  const value = (platform ?? '').toLowerCase();

  if (value.includes('darwin') || value.includes('mac')) {
    return '🍎';
  }

  if (value.includes('win')) {
    return '🪟';
  }

  return '🖥️';
}

function lastSeen(device: Device): string {
  if (!device.lastSeenAt) {
    return 'Never seen';
  }

  return `${formatDistanceToNow(new Date(device.lastSeenAt))} ago`;
}

export default function DevicesPage() {
  useAuth({ requireAuth: true });
  const [license, setLicense] = useState<License | null>(null);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  async function loadLicense() {
    try {
      setLicense(await licenseApi.getMy());
    } catch (error) {
      toast.error(getApiError(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLicense();
  }, []);

  const activeDevices = useMemo(
    () => license?.devices?.filter((device) => device.isActive) ?? [],
    [license],
  );
  const inactiveDevices = useMemo(
    () => license?.devices?.filter((device) => !device.isActive) ?? [],
    [license],
  );

  async function removeDevice(device: Device) {
    if (!license) {
      return;
    }

    if (!window.confirm(`Remove ${device.deviceName ?? 'this device'}?`)) {
      return;
    }

    setRemoving(device.id);

    try {
      await licenseApi.revokeDevice(license.id, device.id);
      toast.success('Device removed');
      await loadLicense();
    } catch (error) {
      toast.error(getApiError(error));
    } finally {
      setRemoving(null);
    }
  }

  if (loading) {
    return <div className="spinner" aria-label="Loading devices" />;
  }

  if (!license) {
    return (
      <div className="card">
        <h1>No devices found</h1>
        <p className="muted">Activate a license to register this workstation.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <section>
        <p className="eyebrow">Devices</p>
        <h1>Device management</h1>
        <p className="muted">
          Active devices consume seats. Removed devices remain visible for audit
          history.
        </p>
      </section>

      <div className="grid two">
        {activeDevices.map((device) => (
          <article className="card" key={device.id}>
            <div className="spread">
              <div>
                <h3>
                  {osIcon(device.platform)} {device.deviceName ?? 'Unnamed device'}
                </h3>
                <p className="muted">
                  {device.platform ?? 'Unknown'} {device.osVersion ?? ''}
                </p>
              </div>
              <span className="badge badge-green">Active</span>
            </div>
            <p className="muted">Last seen {lastSeen(device)}</p>
            <button
              className="btn btn-danger"
              disabled={removing === device.id}
              onClick={() => void removeDevice(device)}
              type="button"
            >
              {removing === device.id ? 'Removing...' : 'Remove'}
            </button>
          </article>
        ))}
      </div>

      {inactiveDevices.length > 0 && (
        <section className="stack">
          <h2>Removed devices</h2>
          <div className="grid two">
            {inactiveDevices.map((device) => (
              <article className="card dimmed" key={device.id}>
                <div className="spread">
                  <div>
                    <h3>
                      {osIcon(device.platform)} {device.deviceName ?? 'Unnamed'}
                    </h3>
                    <p className="muted">{device.platform ?? 'Unknown'}</p>
                  </div>
                  <span className="badge badge-red">Inactive</span>
                </div>
                <p className="muted">Last seen {lastSeen(device)}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

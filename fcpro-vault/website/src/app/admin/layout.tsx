'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../lib/auth';

const nav = [
  { href: '/admin', label: 'Stats' },
  { href: '/admin/licenses', label: 'Licenses' },
  { href: '/admin/audit', label: 'Audit Log' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut, loading } = useAuth({ requireAuth: true, requireAdmin: true });

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" href="/admin">
          <span className="brand-mark">F</span>
          <span>FCPro Vault</span>
        </Link>
        <div className="badge badge-red" style={{ marginTop: 14, width: 'fit-content' }}>
          ADMIN
        </div>
        <nav className="sidebar-nav">
          {nav.map((item) => (
            <Link
              key={item.href}
              className={`sidebar-link ${pathname === item.href ? 'active' : ''}`}
              href={item.href}
            >
              <ShieldAlert size={16} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div>{loading ? 'Checking session...' : user?.email}</div>
          <button
            className="btn btn-ghost"
            onClick={() => {
              signOut();
              router.push('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="shell-main">{children}</main>
    </div>
  );
}

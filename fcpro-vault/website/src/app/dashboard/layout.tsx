'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode } from 'react';
import { useAuth } from '../../lib/auth';

const navLinks = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/downloads', label: 'Projects' },
  { href: '/dashboard/devices', label: 'Devices' },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth({ requireAuth: true });

  function signOut() {
    localStorage.removeItem('fcpro_token');
    router.push('/login');
  }

  if (loading) {
    return (
      <main className="center-page">
        <div className="spinner" />
      </main>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="logo">
          <span className="logo-mark">F</span>
          <span>FCPro Vault</span>
        </Link>
        <nav className="side-nav">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link key={link.href} href={link.href} className={active ? 'active' : ''}>
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-user">
          <strong>{user?.name}</strong>
          <span>{user?.email}</span>
          <button className="btn btn-ghost" type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="shell-main">{children}</main>
    </div>
  );
}

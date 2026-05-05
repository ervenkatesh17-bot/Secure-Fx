'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import toast from 'react-hot-toast';
import { authApi, getApiError } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const session = await authApi.login({ email, password });
      localStorage.setItem('fcpro_token', session.token);
      localStorage.setItem('fcpro_user', JSON.stringify(session.user));
      toast.success('Welcome back');
      router.push(session.user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (error) {
      toast.error(getApiError(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card fade-up" onSubmit={submit}>
        <Link href="/" className="brand auth-brand">
          <span className="brand-mark">F</span> FCPro Vault
        </Link>
        <h1>Sign in</h1>
        <p>Access your licensed projects and devices.</p>
        <label>
          Email
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button className="btn btn-amber" type="submit" disabled={loading}>
          {loading ? <span className="spinner" /> : 'Sign in'}
        </button>
        <span className="muted">
          New here? <Link href="/register">Create an account</Link>
        </span>
      </form>
    </main>
  );
}

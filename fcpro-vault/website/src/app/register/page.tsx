'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import toast from 'react-hot-toast';
import { authApi, getApiError } from '../../lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await authApi.register({ name, email, password });
      localStorage.setItem('fcpro_token', response.token);
      toast.success('Account created');
      router.push('/dashboard');
    } catch (error) {
      toast.error(getApiError(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card fade-up" onSubmit={onSubmit}>
        <Link className="brand" href="/">
          <span className="brand-mark">F</span>
          <span>FCPro Vault</span>
        </Link>
        <h1>Create your vault</h1>
        <p>Register to manage licenses, projects, and devices.</p>

        <label>
          Name
          <input
            className="input"
            maxLength={100}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label>
          Email
          <input
            className="input"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label>
          Password
          <input
            className="input"
            minLength={8}
            maxLength={100}
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <button className="btn btn-amber" disabled={loading} type="submit">
          {loading ? 'Creating...' : 'Create account'}
        </button>
        <p className="auth-link">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </main>
  );
}

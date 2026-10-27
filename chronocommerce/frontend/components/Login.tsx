'use client';
import { useState } from 'react';
import { api, Session } from '../lib/api';

export default function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [f, setF] = useState({ email: '', password: '', fullName: '' });
  const [err, setErr] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try {
      if (mode === 'register') await api('/api/auth/register', { body: f });
      onLogin(await api('/api/auth/login', { body: { email: f.email, password: f.password } }));
    } catch (x: any) { setErr(x.message); }
  }
  return (
    <section><h2>{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
      <form onSubmit={submit}>
        {mode === 'register' && <input placeholder="Full name" value={f.fullName} onChange={e => setF({ ...f, fullName: e.target.value })} required />}
        <input type="email" placeholder="Email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required />
        <input type="password" placeholder="Password (min 8)" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required minLength={8} />
        <button>{mode === 'login' ? 'Sign in' : 'Register'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Need an account?' : 'Have an account?'}</button>
      </form>
      {err && <p className="error">{err}</p>}
    </section>
  );
}

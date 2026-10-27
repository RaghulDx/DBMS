'use client';
import { useEffect, useState } from 'react';
import Login from '../components/Login';
import Shop from '../components/Shop';
import TimeTravel from '../components/TimeTravel';
import Manager from '../components/Manager';
import Admin from '../components/Admin';
import { Session } from '../lib/api';

export default function Home() {
  const [session, setSession] = useState<Session>(null);
  const [tab, setTab] = useState('shop');
  useEffect(() => { try { const s = sessionStorage.getItem('cc'); if (s) setSession(JSON.parse(s)); } catch {} }, []);
  const login = (s: Session) => { setSession(s); try { sessionStorage.setItem('cc', JSON.stringify(s)); } catch {} };
  const logout = () => { setSession(null); setTab('shop'); try { sessionStorage.removeItem('cc'); } catch {} };
  const role = session?.user.role;
  const tabs = [['shop', 'Shop'], ['time', 'Time travel'], ...(role && role !== 'CUSTOMER' ? [['manager', 'Manager']] : []), ...(role === 'ADMIN' ? [['admin', 'Admin']] : [])];

  return <main>
    <header>
      <p className="eyebrow">Temporal pricing &middot; cryptographic ledger</p>
      <h1>ChronoCommerce</h1>
      <p>Product prices are versioned, never overwritten. Payments are chained with SHA-256 and cannot be altered without detection.</p>
      <nav>{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}
        {session ? <span className="who"><b>{session.user.email}</b> ({role}) <button onClick={logout}>Sign out</button></span> : null}</nav>
    </header>
    {!session && tab === 'shop' && <Login onLogin={login} />}
    {tab === 'shop' && <Shop session={session} />}
    {tab === 'time' && <TimeTravel />}
    {tab === 'manager' && session && <Manager session={session} />}
    {tab === 'admin' && session && <Admin session={session} />}
  </main>;
}

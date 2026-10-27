'use client';
import { useEffect, useState } from 'react';
import { api, Session } from '../lib/api';

export default function Admin({ session }: { session: NonNullable<Session> }) {
  const [users, setUsers] = useState<any[]>([]);
  const load = () => api('/api/admin/users', { token: session.token }).then(setUsers);
  useEffect(() => { load(); }, []);
  const setRole = async (id: number, role: string) => { await api(`/api/admin/users/${id}/role`, { method: 'PATCH', body: { role }, token: session.token }); load(); };
  return <section><h2>User roles</h2>
    <table><thead><tr><th>Email</th><th>Name</th><th>Role</th></tr></thead><tbody>
      {users.map(u => <tr key={u.id}><td>{u.email}</td><td>{u.fullName}</td><td>
        <select value={u.role} disabled={u.id === session.user.id} onChange={e => setRole(u.id, e.target.value)}>{['CUSTOMER', 'MANAGER', 'ADMIN'].map(r => <option key={r}>{r}</option>)}</select></td></tr>)}
    </tbody></table></section>;
}

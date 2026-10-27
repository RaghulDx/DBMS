export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const r = await fetch(API + path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}

export type User = { id: number; email: string; fullName: string; role: 'CUSTOMER' | 'MANAGER' | 'ADMIN' };
export type Session = { token: string; user: User } | null;
export const money = (v: unknown) => (v == null ? '—' : `$${Number(v).toFixed(2)}`);
export const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

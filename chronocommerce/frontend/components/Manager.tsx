'use client';
import { useEffect, useState } from 'react';
import { api, money, Session } from '../lib/api';

export default function Manager({ session }: { session: NonNullable<Session> }) {
  const t = session.token;
  const [products, setProducts] = useState<any[]>([]);
  const [pid, setPid] = useState('');
  const [price, setPrice] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [ledger, setLedger] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [verify, setVerify] = useState<any>();
  const [msg, setMsg] = useState('');

  const load = () => {
    api('/api/products').then(setProducts);
    api('/api/audit/ledger', { token: t }).then(setLedger);
    api('/api/inventory/logs', { token: t }).then(setLogs);
  };
  useEffect(() => { load(); }, []);
  const run = (fn: () => Promise<unknown>, ok: string) => async () => {
    try { await fn(); setMsg(ok); load(); } catch (e: any) { setMsg(e.message); }
  };

  return <>
    <section><h2>Pricing &amp; stock</h2>
      <select value={pid} onChange={e => setPid(e.target.value)}><option value="">Select product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} ({money(p.currentPrice)}, stock {p.stockQuantity})</option>)}</select><br />
      <input type="number" step="0.01" placeholder="New price" value={price} onChange={e => setPrice(e.target.value)} />
      <button disabled={!pid || !price} onClick={run(() => api(`/api/products/${pid}/price`, { body: { price: Number(price) }, token: t }), 'New price interval recorded; the old one was closed, not overwritten.')}>Set price</button><br />
      <input type="number" placeholder="Stock change (+/−)" value={delta} onChange={e => setDelta(e.target.value)} />
      <input placeholder="Reason" value={reason} onChange={e => setReason(e.target.value)} />
      <button disabled={!pid || !delta || !reason} onClick={run(() => api(`/api/products/${pid}/stock`, { body: { delta: Number(delta), reason }, token: t }), 'Stock adjusted.')}>Adjust stock</button>
      {msg && <p className="result">{msg}</p>}
    </section>
    <section><h2>Audit ledger</h2>
      <button onClick={async () => setVerify(await api('/api/audit/verify', { token: t }))}>Verify hash chain</button>
      {verify && <p className={verify.intact ? 'result' : 'error'}>{verify.intact ? 'Chain intact — no tampering detected.' : `TAMPERING DETECTED: ${verify.broken.map((b: any) => `#${b.ledger_id} ${b.problem}`).join('; ')}`}</p>}
      <table><thead><tr><th>#</th><th>Order</th><th>Amount</th><th>prev_hash</th><th>curr_hash</th></tr></thead><tbody>
        {ledger.map(l => <tr key={l.id}><td>{l.id}</td><td>{l.orderId}</td><td>{money(l.amount)}</td><td className="hash">{l.prevHash?.slice(0, 12)}…</td><td className="hash">{l.currHash?.slice(0, 12)}…</td></tr>)}
      </tbody></table>
    </section>
    <section><h2>Inventory log</h2>
      <table><thead><tr><th>When</th><th>Product</th><th>Δ</th><th>Reason</th><th>By</th></tr></thead><tbody>
        {logs.map(l => <tr key={l.id}><td>{new Date(l.timestamp).toLocaleString()}</td><td>{l.product.name}</td><td>{l.qtyDelta}</td><td>{l.reason}</td><td>{l.changedByUser.email}</td></tr>)}
      </tbody></table>
    </section>
  </>;
}

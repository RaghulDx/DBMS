'use client';
import { useEffect, useState } from 'react';
import { api, money, toLocalInput } from '../lib/api';

export default function TimeTravel() {
  const [products, setProducts] = useState<any[]>([]);
  const [id, setId] = useState('');
  const [time, setTime] = useState(toLocalInput(new Date()));
  const [price, setPrice] = useState<any>();
  const [history, setHistory] = useState<any[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => { api('/api/products').then(setProducts); }, []);

  async function lookup() {
    if (!id) return;
    setErr('');
    try {
      setPrice(await api(`/api/products/${id}/price-at?time=${encodeURIComponent(new Date(time).toISOString())}`));
      setHistory(await api(`/api/products/${id}/price-history`));
    } catch (e: any) { setErr(e.message); setPrice(undefined); }
  }
  return <section><h2>Time-travel price lookup</h2>
    <select value={id} onChange={e => setId(e.target.value)}><option value="">Select product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
    <input type="datetime-local" value={time} onChange={e => setTime(e.target.value)} />
    <button onClick={lookup}>Lookup historical price</button>
    {err && <p className="error">{err}</p>}
    {price && <p className="result">{price.price == null ? 'No price existed at that time.' : <>Price at selected time: <strong>{money(price.price)}</strong></>}</p>}
    {history.length > 0 && <table><thead><tr><th>Price</th><th>Valid from</th><th>Valid to</th></tr></thead><tbody>
      {history.map(h => <tr key={h.id}><td>{money(h.price)}</td><td>{new Date(h.valid_from).toLocaleString()}</td><td>{h.valid_to ? new Date(h.valid_to).toLocaleString() : 'current'}</td></tr>)}
    </tbody></table>}
  </section>;
}

'use client';
import { useEffect, useState } from 'react';
import { api, money, Session } from '../lib/api';
import Pager from './Pager';

export default function Shop({ session }: { session: Session }) {
  const [products, setProducts] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<Record<number, number>>({});
  const [orders, setOrders] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [productPages, setProductPages] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [orderPages, setOrderPages] = useState(1);

  const loadProducts = () => api(`/api/products?category=${cat}&q=${encodeURIComponent(q)}&page=${productPage}`)
    .then(r => { setProducts(r.items); setProductPages(r.totalPages); }).catch(e => setMsg(e.message));
  const loadOrders = () => session && api(`/api/orders?page=${orderPage}`, { token: session.token })
    .then(r => { setOrders(r.items); setOrderPages(r.totalPages); }).catch(() => {});
  useEffect(() => { api('/api/categories').then(setCats); }, []);
  useEffect(() => { setProductPage(1); }, [cat, q]);
  useEffect(() => { loadProducts(); }, [cat, q, productPage]);
  useEffect(() => { loadOrders(); }, [session, orderPage]);

  const lines = Object.entries(cart).filter(([, n]) => n > 0).map(([id, n]) => ({ productId: Number(id), quantity: n }));
  const total = lines.reduce((s, l) => s + Number(products.find(p => p.id === l.productId)?.currentPrice ?? 0) * l.quantity, 0);

  async function checkout() {
    try {
      const { orderId } = await api('/api/orders', { body: { items: lines }, token: session!.token });
      await api(`/api/orders/${orderId}/pay`, { method: 'POST', body: {}, token: session!.token });
      setCart({}); setMsg(`Order #${orderId} paid and recorded in the audit ledger.`);
      loadProducts(); loadOrders();
    } catch (e: any) { setMsg(e.message); }
  }

  return <>
    <section><h2>Catalog</h2>
      <select value={cat} onChange={e => setCat(e.target.value)}><option value="">All categories</option>{cats.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select>
      <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
      {products.map(p => <div className="card" key={p.id}>
        <div><b>{p.name}</b><br /><span>{p.sku} · {p.category.name} · stock {p.stockQuantity}</span></div>
        <div className="right"><b>{money(p.currentPrice)}</b><br />
          <button disabled={!session || p.stockQuantity < 1 || p.currentPrice == null} onClick={() => setCart({ ...cart, [p.id]: (cart[p.id] ?? 0) + 1 })}>Add</button></div>
      </div>)}
      {!session && <p className="muted">Sign in to place orders.</p>}
      <Pager page={productPage} totalPages={productPages} onChange={setProductPage} />
    </section>
    {session && <section><h2>Cart</h2>
      {lines.length === 0 ? <p className="muted">Empty.</p> : <>
        {lines.map(l => <div key={l.productId} className="row">{products.find(p => p.id === l.productId)?.name} × {l.quantity}
          <button onClick={() => setCart({ ...cart, [l.productId]: l.quantity - 1 })}>−</button></div>)}
        <p><b>Total {money(total)}</b> <button onClick={checkout}>Place &amp; pay order</button></p></>}
      {msg && <p className="result">{msg}</p>}
    </section>}
    {session && <section><h2>{session.user.role === 'CUSTOMER' ? 'My orders' : 'All orders'}</h2>
      {orders.map(o => <div key={o.id} className="card"><div><b>#{o.id}</b> · {o.status} · {new Date(o.orderDate).toLocaleString()}<br />
        <span>{o.items.map((i: any) => `${i.product.name} ×${i.quantity} @ ${money(i.historicalPrice.price)}`).join(', ')}</span></div><b>{money(o.totalAmount)}</b></div>)}
      <Pager page={orderPage} totalPages={orderPages} onChange={setOrderPage} />
    </section>}
  </>;
}

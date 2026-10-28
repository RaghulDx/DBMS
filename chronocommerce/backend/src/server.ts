import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 4000);
const secret = process.env.JWT_SECRET || 'dev-secret';

app.use(cors());
app.use(express.json());

type AuthedRequest = Request & { user?: { id: number; email: string; role: string } };

const auth = (req: AuthedRequest, res: Response, next: NextFunction) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(h.slice(7), secret) as AuthedRequest['user'];
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
const role = (...roles: string[]) => (req: AuthedRequest, res: Response, next: NextFunction) =>
  roles.includes(req.user?.role ?? '') ? next() : res.status(403).json({ error: 'Forbidden' });

// wrap async handlers; Postgres RAISE messages (trigger/constraint failures) surface as 400
const h = (fn: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: Request, res: Response) =>
  fn(req as AuthedRequest, res).catch((e: any) => {
    const msg = e?.meta?.message ?? e?.message ?? 'Request failed';
    res.status(e instanceof z.ZodError ? 422 : 400).json({ error: String(msg).split('\n')[0] });
  });

const json = (data: unknown) => JSON.parse(JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? Number(v) : v)));

// page/pageSize query params -> {page, pageSize, skip}, clamped to sane bounds
const pageParams = (req: Request, defaultSize = 20, maxSize = 100) => {
  const page = Math.max(1, Math.trunc(Number(req.query.page)) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Math.trunc(Number(req.query.pageSize)) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize };
};
const paginated = <T>(items: T[], page: number, pageSize: number, total: number) => ({
  items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

// ---------- auth ----------
app.get('/api/health', (_, res) => res.json({ ok: true }));

app.post('/api/auth/register', h(async (req, res) => {
  const b = z.object({ email: z.string().email(), password: z.string().min(8), fullName: z.string().min(1) }).parse(req.body);
  const u = await prisma.user.create({
    data: { email: b.email, passwordHash: await bcrypt.hash(b.password, 12), fullName: b.fullName, role: 'CUSTOMER' },
  });
  res.status(201).json({ id: u.id, email: u.email, fullName: u.fullName, role: u.role });
}));

app.post('/api/auth/login', h(async (req, res) => {
  const b = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const u = await prisma.user.findUnique({ where: { email: b.email } });
  if (!u || !(await bcrypt.compare(b.password, u.passwordHash))) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: u.id, email: u.email, role: u.role }, secret, { expiresIn: '2h' });
  res.json({ token, user: { id: u.id, email: u.email, fullName: u.fullName, role: u.role } });
}));

// ---------- catalog ----------
app.get('/api/categories', h(async (_, res) => res.json(await prisma.category.findMany({ orderBy: { name: 'asc' } }))));

app.get('/api/products', h(async (req, res) => {
  const cat = typeof req.query.category === 'string' ? req.query.category : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const { page, pageSize, skip } = pageParams(req, 10);
  const where = {
    ...(cat ? { category: { slug: cat } } : {}),
    ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
  };
  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, include: { category: true }, orderBy: { id: 'asc' }, skip, take: pageSize }),
  ]);
  const prices = await prisma.$queryRaw<{ product_id: number; price: string }[]>`SELECT product_id, price FROM current_product_prices`;
  const map = new Map(prices.map((p) => [p.product_id, p.price]));
  res.json(json(paginated(products.map((p) => ({ ...p, currentPrice: map.get(p.id) ?? null })), page, pageSize, total)));
}));

// time travel: price at an arbitrary instant (stored procedure)
app.get('/api/products/:id/price-at', h(async (req, res) => {
  const { time } = z.object({ time: z.string().refine((s) => !isNaN(Date.parse(s)), 'invalid time') }).parse(req.query);
  const id = Number(req.params.id);
  const rows = await prisma.$queryRaw<{ price: string | null }[]>`SELECT sp_get_product_price_at(${id}::int, ${new Date(time)}::timestamptz) AS price`;
  res.json({ productId: id, time, price: rows[0].price });
}));

app.get('/api/products/:id/price-history', h(async (req, res) => {
  const id = Number(req.params.id);
  res.json(json(await prisma.$queryRaw`SELECT * FROM sp_get_price_history(${id}::int)`));
}));

// new price = new interval; previous interval is closed by trigger
app.post('/api/products/:id/price', auth, role('MANAGER', 'ADMIN'), h(async (req, res) => {
  const b = z.object({ price: z.number().nonnegative(), validFrom: z.string().optional() }).parse(req.body);
  const from = b.validFrom ? new Date(b.validFrom) : new Date();
  const id = Number(req.params.id);
  await prisma.$executeRaw`INSERT INTO product_price_history(product_id, price, valid_from) VALUES (${id}::int, ${b.price}::numeric, ${from}::timestamptz)`;
  res.status(201).json({ ok: true });
}));

// ---------- orders ----------
app.post('/api/orders', auth, h(async (req, res) => {
  const b = z.object({ items: z.array(z.object({ productId: z.number().int(), quantity: z.number().int().positive() })).min(1) }).parse(req.body);
  const rows = await prisma.$queryRaw<{ id: number }[]>`SELECT sp_place_order(${req.user!.id}::int, ${JSON.stringify(b.items)}::jsonb) AS id`;
  res.status(201).json({ orderId: rows[0].id });
}));

app.post('/api/orders/:id/pay', auth, h(async (req, res) => {
  const id = Number(req.params.id);
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order || (order.customerId !== req.user!.id && req.user!.role === 'CUSTOMER')) return res.status(404).json({ error: 'Order not found' });
  await prisma.$executeRaw`SELECT sp_pay_order(${id}::int)`;
  res.json({ ok: true });
}));

app.get('/api/orders', auth, h(async (req, res) => {
  const staff = req.user!.role !== 'CUSTOMER';
  const where = staff ? {} : { customerId: req.user!.id };
  const { page, pageSize, skip } = pageParams(req, 10);
  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: { items: { include: { product: true, historicalPrice: true } } },
      orderBy: { id: 'desc' },
      skip, take: pageSize,
    }),
  ]);
  res.json(json(paginated(orders, page, pageSize, total)));
}));

// ---------- inventory ----------
app.post('/api/products/:id/stock', auth, role('MANAGER', 'ADMIN'), h(async (req, res) => {
  const b = z.object({ delta: z.number().int().refine((n) => n !== 0), reason: z.string().min(1) }).parse(req.body);
  await prisma.$executeRaw`SELECT sp_adjust_stock(${Number(req.params.id)}::int, ${req.user!.id}::int, ${b.delta}::int, ${b.reason})`;
  res.json({ ok: true });
}));

app.get('/api/inventory/logs', auth, role('MANAGER', 'ADMIN'), h(async (_, res) =>
  res.json(await prisma.inventoryLog.findMany({ orderBy: { id: 'desc' }, take: 100, include: { product: true, changedByUser: { select: { email: true } } } }))));

// ---------- audit ----------
app.get('/api/audit/ledger', auth, role('MANAGER', 'ADMIN'), h(async (_, res) =>
  res.json(json(await prisma.ledgerTransaction.findMany({ orderBy: { id: 'desc' }, take: 100 })))));

app.get('/api/audit/verify', auth, role('MANAGER', 'ADMIN'), h(async (_, res) => {
  const broken = await prisma.$queryRaw<{ ledger_id: number; problem: string }[]>`SELECT * FROM sp_verify_ledger()`;
  res.json({ intact: broken.length === 0, broken });
}));

// ---------- admin ----------
app.get('/api/admin/users', auth, role('ADMIN'), h(async (_, res) =>
  res.json(await prisma.user.findMany({ select: { id: true, email: true, fullName: true, role: true, createdAt: true }, orderBy: { id: 'asc' } }))));

app.patch('/api/admin/users/:id/role', auth, role('ADMIN'), h(async (req, res) => {
  const b = z.object({ role: z.enum(['CUSTOMER', 'MANAGER', 'ADMIN']) }).parse(req.body);
  res.json(await prisma.user.update({ where: { id: Number(req.params.id) }, data: { role: b.role }, select: { id: true, email: true, role: true } }));
}));

app.listen(port, () => console.log(`ChronoCommerce API on :${port}`));

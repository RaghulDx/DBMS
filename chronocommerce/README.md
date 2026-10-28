# ChronoCommerce

Bi-temporal e-commerce engine: PostgreSQL system-versioned pricing + an append-only,
SHA-256 hash-chained audit ledger. Built for Database Systems (BCSE307L) — see
[`docs/project-proposal.md`](docs/project-proposal.md) for the full proposal.

## Project description

Most e-commerce schemas overwrite a product's price in place and log payments in an ordinary,
editable table. ChronoCommerce does neither:

- **Temporal pricing** — a price change *inserts* a new `[valid_from, valid_to)` interval; a
  trigger closes the previous one instead of ever running `UPDATE products SET price = ...`.
  A GiST exclusion constraint forbids overlapping intervals, and a guard trigger forbids
  editing or deleting history outright. `sp_get_product_price_at(id, ts)` answers "what did
  this cost on this date" directly from the database; `order_items.historical_price_id` pins
  every sale to the exact price row it was sold at, forever.
- **Cryptographic ledger** — trigger `fn_chain_ledger_transaction` computes
  `curr_hash = SHA256(prev_hash | order_id | amount | created_at)` for every payment (an
  advisory lock keeps the chain linear under concurrent writes). `UPDATE`/`DELETE`/`TRUNCATE`
  are rejected by triggers; `sp_verify_ledger()` recomputes the whole chain and reports exactly
  which row's hash no longer matches, catching tampering even by a privileged DB user.
- **RBAC** — a single `users` table with a `role` enum (`CUSTOMER` / `MANAGER` / `ADMIN`),
  enforced both by JWT middleware on the API and by Postgres constraints.

See [`docs/er-diagram.svg`](docs/er-diagram.svg), [`docs/relational-schema.md`](docs/relational-schema.md),
and [`docs/data-dictionary.md`](docs/data-dictionary.md) for the full database design.

## Technology stack

| Layer | Choice |
|---|---|
| Database | PostgreSQL 16 (pgcrypto, btree_gist, range types, triggers, stored procedures, views) |
| ORM | Prisma |
| Backend | Express.js (Node.js, TypeScript) + JWT auth, zod validation |
| Frontend | Next.js (React, TypeScript) |
| Password hashing | bcrypt |
| Containerization | Docker / Docker Compose |

8 normalised (3NF) tables: `users, categories, products, product_price_history, orders,
order_items, ledger_transactions, inventory_logs`.

## Installation & execution steps

### Option A — Docker Compose (whole stack)
Builds and runs Postgres, the backend, and the frontend together.

```bash
cd chronocommerce
docker compose up -d --build
docker compose exec backend npx prisma generate
docker compose exec backend npm run seed
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- Postgres: localhost:5432 (`postgres` / `postgres`)

### Option B — Postgres in Docker, backend/frontend on the host (faster dev loop)
```bash
cd chronocommerce
docker compose up -d postgres     # Postgres only; runs migrations/*.sql on first start

cp .env.example backend/.env      # set DATABASE_URL, JWT_SECRET, PORT
cd backend
npm install
npx prisma generate
npm run seed
npm run dev                       # http://localhost:<PORT>

cd ../frontend
npm install
npm run dev                       # http://localhost:3000; NEXT_PUBLIC_API_URL in .env.local must match the backend port
```

No Docker at all? `createdb chronocommerce && for f in migrations/*.sql; do psql "$DATABASE_URL" -f $f; done`,
then continue from the backend step above.

SQL in `migrations/` is the source of truth for the schema; Prisma is only the typed client
(`prisma generate` — this project does not use `prisma migrate`).

Seed logins (password `Password123!`): `admin@chrono.test`, `manager@chrono.test`,
`customer@chrono.test`.

## Demo script
1. Time travel tab: pick *Noise-Cancelling Headphones*, query 2026-03-01 (199.00), 2026-07-01
   (179.00), now (149.00).
2. As customer: add to cart, place & pay -> a ledger row appears.
3. As manager: set a new price (old interval is closed, not overwritten); adjust stock;
   **Verify hash chain** -> intact.
4. Tamper test (psql): `UPDATE ledger_transactions SET amount=1 WHERE id=1;` is rejected. As
   superuser, `ALTER TABLE ledger_transactions DISABLE TRIGGER trg_ledger_no_mutation;` then
   update -> **Verify** reports the broken link.
5. Catalog search/filter/pagination: filter by category, search by name, page through results
   with 10 products per page (`Pager` component); order history paginates the same way.
6. Resize the browser below ~640px to see the responsive mobile layout.

## Backup & restore
Native Postgres tools, run against `DATABASE_URL`:
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chronocommerce scripts/backup.sh
#   -> writes backups/chronocommerce-<timestamp>.dump (pg_dump, custom format)
scripts/restore.sh backups/chronocommerce-<timestamp>.dump
#   -> pg_restore --clean --if-exists
```

## Documentation
- [ER diagram](docs/er-diagram.svg)
- [Relational schema](docs/relational-schema.md)
- [Data dictionary](docs/data-dictionary.md)
- [Project proposal](docs/project-proposal.md)

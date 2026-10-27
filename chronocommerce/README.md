# ChronoCommerce

Bi-temporal e-commerce engine (DBTHON 2026): PostgreSQL system-versioned pricing + an append-only, SHA-256 hash-chained audit ledger.

## Stack
Next.js + TypeScript · Express + TypeScript · PostgreSQL 16 + pgcrypto/btree_gist · Prisma · bcrypt + JWT

## Database design
- 8 normalised (3NF) tables: `users, categories, products, product_price_history, orders, order_items, ledger_transactions, inventory_logs`.
- **Temporal pricing** – a price change *inserts* a new `[valid_from, valid_to)` interval; a trigger closes the previous one. A GiST exclusion constraint forbids overlapping intervals; a guard trigger forbids editing/deleting history. `sp_get_product_price_at(id, ts)` answers point-in-time queries; `order_items.historical_price_id` pins every sale to the exact price row.
- **Cryptographic ledger** – trigger `fn_chain_ledger_transaction` computes `curr_hash = SHA256(prev_hash|order_id|amount|created_at)` (advisory lock keeps the chain linear). UPDATE/DELETE/TRUNCATE are rejected by triggers; `sp_verify_ledger()` recomputes the chain and reports broken links.
- **Transactions** – `sp_place_order` (price lookup, stock decrement guarded by `CHECK(stock_quantity>=0)`, inventory log, all atomic), `sp_pay_order` (writes the ledger row), `sp_adjust_stock`.
- **RBAC** – `CUSTOMER / MANAGER / ADMIN` enum on `users`, enforced by JWT middleware.

## Quick start
```bash
docker compose up -d          # Postgres 16; runs migrations/*.sql on first start of an empty volume
# no Docker? createdb chronocommerce && for f in migrations/*.sql; do psql "$DATABASE_URL" -f $f; done
cp .env.example backend/.env  # set DATABASE_URL, JWT_SECRET, PORT
cd backend && npm install && npx prisma generate && npm run seed && npm run dev
cd frontend && npm install && npm run dev   # NEXT_PUBLIC_API_URL in frontend/.env.local must match the backend port
```
Seed logins (password `Password123!`): `admin@chrono.test`, `manager@chrono.test`, `customer@chrono.test`.

SQL in `migrations/` is the source of truth for the schema; Prisma is only the typed client (`prisma generate`, no `prisma migrate`).

## Demo script
1. Time travel tab: pick *Noise-Cancelling Headphones*, query 2026-03-01 (199.00), 2026-07-01 (179.00), now (149.00).
2. As customer: add to cart, place & pay -> a ledger row appears.
3. As manager: set a new price (old interval is closed, not overwritten); adjust stock; **Verify hash chain** -> intact.
4. Tamper test (psql): `UPDATE ledger_transactions SET amount=1 WHERE id=1;` is rejected. As superuser, `ALTER TABLE ledger_transactions DISABLE TRIGGER trg_ledger_no_mutation;` then update -> **Verify** reports the broken link.

## Backup
`DATABASE_URL=... scripts/backup.sh` (pg_dump, custom format) · `scripts/restore.sh <dump>` (pg_restore).

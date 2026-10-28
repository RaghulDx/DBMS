# Data Dictionary

Types and constraints as defined in [`../migrations/001_init.sql`](../migrations/001_init.sql)
and [`002_integrity.sql`](../migrations/002_integrity.sql).

## `users`
Single table for every role — see "Why one `users` table" below.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | SERIAL | PK | surrogate key |
| email | TEXT | UNIQUE, NOT NULL | login identity |
| password_hash | TEXT | NOT NULL | bcrypt hash, cost 12 — never the raw password |
| full_name | TEXT | NOT NULL | display name |
| role | user_role (ENUM) | NOT NULL, DEFAULT `CUSTOMER` | `CUSTOMER`, `MANAGER`, or `ADMIN` |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | account creation time |

## `categories`

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | SERIAL | PK | surrogate key |
| name | TEXT | UNIQUE, NOT NULL | display name, e.g. "Electronics" |
| slug | TEXT | UNIQUE, NOT NULL | URL-safe identifier, e.g. "electronics" |

## `products`

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | SERIAL | PK | surrogate key |
| category_id | INT | FK -> categories.id, NOT NULL | owning category |
| sku | TEXT | UNIQUE, NOT NULL | stock-keeping unit code |
| name | TEXT | NOT NULL | display name |
| stock_quantity | INT | NOT NULL, DEFAULT 0, CHECK >= 0 | units on hand; a sale cannot push it negative |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | listing date |

## `product_price_history`
Append-only, system-versioned. See [relational-schema.md](relational-schema.md) for why this
is a separate table rather than a `products.price` column.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | SERIAL | PK | surrogate key |
| product_id | INT | FK -> products.id, NOT NULL | priced product |
| price | NUMERIC(10,2) | NOT NULL, CHECK >= 0 | price in effect during this interval |
| valid_from | TIMESTAMPTZ | NOT NULL | interval start (inclusive) |
| valid_to | TIMESTAMPTZ | NULL = still open | interval end (exclusive); NULL means "current" |
| — | — | EXCLUDE USING gist (product_id WITH =, tstzrange(valid_from, valid_to, '[)') WITH &&) | no two intervals for the same product may overlap |
| — | — | trigger `trg_guard_price_history` | blocks UPDATE of price/product_id/valid_from and all DELETEs — a new price is always a new row |

## `orders`

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | SERIAL | PK | surrogate key |
| customer_id | INT | FK -> users.id, NOT NULL | placing customer |
| order_date | TIMESTAMPTZ | NOT NULL, DEFAULT now() | placement time |
| total_amount | NUMERIC(12,2) | NOT NULL, DEFAULT 0 | sum of line-item subtotals |
| status | order_status (ENUM) | NOT NULL, DEFAULT `PENDING` | `PENDING`, `PAID`, `SHIPPED`, `CANCELLED` |

## `order_items`

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | SERIAL | PK | surrogate key |
| order_id | INT | FK -> orders.id, NOT NULL, ON DELETE CASCADE | parent order |
| product_id | INT | FK -> products.id, NOT NULL | purchased product |
| historical_price_id | INT | FK -> product_price_history.id, NOT NULL | exact price row this line was sold at — never re-resolved later |
| quantity | INT | NOT NULL, CHECK > 0 | units purchased |
| subtotal | NUMERIC(12,2) | NOT NULL, CHECK >= 0 | `price * quantity` at sale time |

## `ledger_transactions`
Append-only, hash-chained settlement ledger. See [README.md](../README.md) for the tamper-test.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | SERIAL | PK | surrogate key, also the chain's sequence number |
| order_id | INT | FK -> orders.id, UNIQUE, NOT NULL | settled order (one ledger row per order) |
| amount | NUMERIC(12,2) | NOT NULL | amount settled |
| prev_hash | TEXT | set by trigger | `curr_hash` of the previous row (genesis = 64 zeros) |
| curr_hash | TEXT | set by trigger | `SHA256(prev_hash \| order_id \| amount \| created_at)` |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | settlement time |
| — | — | triggers `trg_ledger_no_mutation` / `trg_ledger_no_truncate` | reject every UPDATE, DELETE, and TRUNCATE outright |

## `inventory_logs`
Every stock movement is logged here by `sp_adjust_stock` / `sp_place_order`, so
`products.stock_quantity` can never drift without an attributable record.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | SERIAL | PK | surrogate key |
| product_id | INT | FK -> products.id, NOT NULL | affected product |
| changed_by_user_id | INT | FK -> users.id, NOT NULL | who caused the change (customer on purchase, manager on restock) |
| qty_delta | INT | NOT NULL | signed change, e.g. `-1` for a sale, `+50` for a restock |
| reason | TEXT | NOT NULL | free-text justification, e.g. `"ORDER #42"`, `"damaged in transit"` |
| timestamp | TIMESTAMPTZ | NOT NULL, DEFAULT now() | when the movement happened |

## Views, stored procedures, triggers

| Object | Kind | Purpose |
|---|---|---|
| `current_product_prices` | VIEW | one row per product: its currently-open price interval |
| `sp_get_product_price_at(id, ts)` | function | point-in-time price lookup ("time travel") |
| `sp_get_price_history(id)` | function | full price-interval history for a product |
| `sp_place_order(customer, items jsonb)` | stored procedure | atomically creates an order, resolves each line's live price, decrements stock, logs inventory — rolls back entirely on any failure (e.g. oversell) |
| `sp_pay_order(order_id)` | stored procedure | marks an order PAID and writes its ledger row |
| `sp_adjust_stock(product, user, delta, reason)` | stored procedure | manager restock/correction with an audit row |
| `sp_verify_ledger()` | function | recomputes the whole hash chain, returns every row whose hash no longer matches |
| `fn_close_previous_price` | trigger (BEFORE INSERT on `product_price_history`) | closes the previously-open interval instead of ever overwriting a price |
| `fn_guard_price_history` | trigger (BEFORE UPDATE/DELETE on `product_price_history`) | enforces append-only pricing |
| `fn_chain_ledger_transaction` | trigger (BEFORE INSERT on `ledger_transactions`) | computes the SHA-256 hash chain |
| `fn_ledger_immutable` | trigger (BEFORE UPDATE/DELETE/TRUNCATE on `ledger_transactions`) | enforces append-only ledger |

## Indexes

| Index | Table(s) | Reason |
|---|---|---|
| `idx_price_history_temporal` | `product_price_history(product_id, valid_from, valid_to)` | speeds up point-in-time and current-price lookups |
| `idx_orders_customer` | `orders(customer_id, order_date)` | speeds up "my orders" listing |
| `idx_inventory_product_time` | `inventory_logs(product_id, timestamp)` | speeds up a product's stock-movement history |
| `ex_price_no_overlap` | `product_price_history` (GiST) | both an index and the overlap-prevention constraint |
| implicit UNIQUE indexes | `users.email`, `categories.name/slug`, `products.sku`, `ledger_transactions.order_id` | uniqueness + fast lookups |

## Why one `users` table, not `admins`/`managers`/`customers`

All three roles share every column (`email`, `password_hash`, `full_name`, etc.) — splitting
them into separate tables would mean duplicating that structure three times and making a
promotion (e.g. customer -> manager) a data-migration instead of a single `UPDATE
users SET role = 'MANAGER'`. A `role` enum column on one table is both the normalized and the
simpler design, and is what `backend/src/server.ts`'s `role(...)` middleware checks against the
JWT's `role` claim for route-level RBAC.

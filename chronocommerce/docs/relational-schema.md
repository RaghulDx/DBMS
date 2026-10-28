# Relational Schema

Derived directly from the ER diagram ([er-diagram.svg](er-diagram.svg)). Primary keys are
**bold**, foreign keys are *italic*. This matches the DDL in
[`../migrations/001_init.sql`](../migrations/001_init.sql) and
[`002_integrity.sql`](../migrations/002_integrity.sql), which are the schema's source of truth.

```
categories(id PK, name, slug)

products(id PK, category_id FK -> categories.id, sku, name, stock_quantity, created_at)

product_price_history(id PK, product_id FK -> products.id, price, valid_from, valid_to)
  -- one open interval (valid_to IS NULL) per product at any time; enforced by a
  -- GiST exclusion constraint on (product_id, tstzrange(valid_from, valid_to))

users(id PK, email, password_hash, full_name, role, created_at)
  -- role ENUM('CUSTOMER','MANAGER','ADMIN') — a single table for every role (see
  -- data-dictionary.md for why this isn't split into per-role tables)

orders(id PK, customer_id FK -> users.id, order_date, total_amount, status)

order_items(id PK, order_id FK -> orders.id, product_id FK -> products.id,
            historical_price_id FK -> product_price_history.id, quantity, subtotal)

ledger_transactions(id PK, order_id FK -> orders.id UNIQUE, amount,
                     prev_hash, curr_hash, created_at)
  -- append-only: UPDATE/DELETE/TRUNCATE rejected by trigger trg_ledger_no_mutation

inventory_logs(id PK, product_id FK -> products.id,
               changed_by_user_id FK -> users.id, qty_delta, reason, timestamp)
```

## Why each FK exists

| Table | FK | Enforces |
|---|---|---|
| `products` | `category_id -> categories.id` | every product belongs to exactly one category |
| `product_price_history` | `product_id -> products.id` | a price interval always belongs to a real product |
| `orders` | `customer_id -> users.id` | every order has a placing customer |
| `order_items` | `order_id -> orders.id` | a line item always belongs to an order |
| `order_items` | `product_id -> products.id` | a line item always refers to a real product |
| `order_items` | `historical_price_id -> product_price_history.id` | a line item is permanently pinned to the exact price row it was sold at, not a mutable "current price" |
| `ledger_transactions` | `order_id -> orders.id` (UNIQUE) | one ledger entry per order, at most — no duplicate settlements |
| `inventory_logs` | `product_id -> products.id` | a stock movement always refers to a real product |
| `inventory_logs` | `changed_by_user_id -> users.id` | every stock movement is attributable to a user |

## Normalization (3NF)

Every non-key column in every table depends on the whole primary key and nothing but the
primary key:

- `product_price_history` exists specifically so `products` doesn't carry a mutable `price`
  column — price is a fact that changes *over time*, so it's modeled as its own table keyed
  by `(product_id, valid_from)`, not duplicated into `products` or `order_items`.
- `order_items.subtotal` is a derived value (`price * quantity`) but is stored, not computed
  on read — this is a deliberate, documented denormalization (an audit/accounting record must
  reflect what was actually charged, which must not silently change if a later price-history
  row is corrected). It's justified, not a modeling oversight.
- No column is repeated across tables except foreign keys themselves (e.g. `category_id` lives
  only on `products`, never duplicated onto `product_price_history` or `order_items`).

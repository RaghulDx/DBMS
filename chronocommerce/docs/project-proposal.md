# Project Proposal — ChronoCommerce

**Course:** Database Systems (BCSE307L) &middot; **Team:** Raghul Damodaran (solo)
> Update the name/register-number/team-member rows below to match your actual submission roster
> before handing this in.

## 1. Project Title
ChronoCommerce — a bi-temporal e-commerce platform with a cryptographically tamper-evident
audit ledger.

## 2. Problem Statement
Most e-commerce database designs overwrite a product's price in place when it changes, and log
payments in an ordinary, mutable table. Both choices lose information a real retailer needs:
you can't answer "what did this item cost on a given date" once the price row has been
overwritten, and nothing stops a row in the payments table from being silently edited by anyone
with database access. ChronoCommerce addresses both at the schema level — prices are
system-versioned (never overwritten) and payments are recorded in an append-only,
SHA-256 hash-chained ledger that detects tampering automatically.

## 3. Objectives
1. Design a normalized (3NF) relational schema of at least 8 interconnected tables covering
   users, catalog, orders, pricing history, and audit trails.
2. Implement system-versioned pricing so a product's price at any past timestamp can be
   retrieved directly from the database, without application-side reconstruction.
3. Implement an append-only, cryptographically chained ledger table where any tampering with a
   past record — even by a privileged database user — is detectable by recomputing the chain.
4. Enforce role-based access control (`CUSTOMER` / `MANAGER` / `ADMIN`) from a single `users`
   table, at both the API layer (JWT) and the database layer (constraints/triggers).
5. Expose the above through a working full-stack application (Next.js + Express + Prisma +
   PostgreSQL) with search, filtering, pagination, and a "time travel" price-lookup UI.

## 4. Scope

**In scope**
- Catalog browsing, search, category filtering, pagination
- Customer checkout (cart -> order -> payment -> ledger entry)
- Manager tools: set a new price (closes the old interval), adjust stock, verify the ledger's
  hash chain
- Admin tools: change a user's role
- Point-in-time ("time travel") price lookup for any product and timestamp
- Database backup/restore via native `pg_dump`/`pg_restore`

**Out of scope**
- Payment gateway integration (checkout is simulated — no real money moves)
- Shipping/logistics tracking beyond an order `status` field
- Multi-currency / multi-tenant support

## 5. Team Members and Responsibilities

| Member | Responsibility |
|---|---|
| Raghul Damodaran | Database design (ER diagram, schema, migrations, stored procedures, triggers), backend API, frontend, deployment |

## 6. Technology Stack

| Layer | Choice |
|---|---|
| Database | PostgreSQL 16 (pgcrypto, btree_gist, range types, triggers, stored procedures) |
| ORM | Prisma |
| Backend | Express.js (Node.js) + JWT auth |
| Frontend | Next.js (React + TypeScript) |
| Password hashing | bcrypt |
| Containerization | Docker / Docker Compose |
| Version control | Git + GitHub |

## 7. Major Deliverables
1. ER diagram, relational schema, and data dictionary (`docs/`)
2. SQL migrations implementing the schema, constraints, triggers, and stored procedures
   (`migrations/`)
3. Working backend API with authentication, RBAC, and CRUD endpoints
4. Working frontend: shop, time-travel lookup, manager console, admin console
5. Backup/restore scripts (`scripts/backup.sh`, `scripts/restore.sh`)
6. Dockerfiles + Compose setup for local and containerized runs
7. This documentation set and the project README

## 8. Project Timeline (Gantt Chart)

| Phase | Wk 1 | Wk 2 | Wk 3 | Wk 4 | Wk 5 | Wk 6 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Requirements & proposal | █ | | | | | |
| ER diagram & relational schema | █ | █ | | | | |
| Core schema + migrations | | █ | █ | | | |
| Stored procedures, triggers, ledger | | | █ | █ | | |
| Backend API (auth, RBAC, CRUD) | | | █ | █ | | |
| Frontend (shop, time travel, manager, admin) | | | | █ | █ | |
| Pagination, responsive UI, validation | | | | | █ | |
| Docker, backup/restore, deployment | | | | | █ | █ |
| Testing, documentation, demo prep | | | | | | █ |

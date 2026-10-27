-- 002_integrity: temporal integrity, immutable ledger, order procedure, seed-free
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Bi-temporal price history -------------------------------------------------
-- No two price intervals of one product may overlap (range index + exclusion).
ALTER TABLE product_price_history DROP CONSTRAINT IF EXISTS ex_price_no_overlap;
ALTER TABLE product_price_history ADD CONSTRAINT ex_price_no_overlap
  EXCLUDE USING gist (product_id WITH =, tstzrange(valid_from, valid_to, '[)') WITH &&);

-- Inserting a new price closes the currently open interval (never UPDATEs price).
CREATE OR REPLACE FUNCTION fn_close_previous_price() RETURNS TRIGGER AS $$
BEGIN
  UPDATE product_price_history SET valid_to = NEW.valid_from
   WHERE product_id = NEW.product_id AND valid_to IS NULL AND valid_from < NEW.valid_from;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_close_previous_price ON product_price_history;
CREATE TRIGGER trg_close_previous_price BEFORE INSERT ON product_price_history
  FOR EACH ROW EXECUTE FUNCTION fn_close_previous_price();

-- Only valid_to may ever change (to close an interval); price/product/valid_from are frozen. No deletes.
CREATE OR REPLACE FUNCTION fn_guard_price_history() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'product_price_history is non-destructive: DELETE not allowed'; END IF;
  IF NEW.price IS DISTINCT FROM OLD.price OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.valid_from IS DISTINCT FROM OLD.valid_from OR (OLD.valid_to IS NOT NULL AND NEW.valid_to IS DISTINCT FROM OLD.valid_to) THEN
    RAISE EXCEPTION 'product_price_history is non-destructive: insert a new interval instead';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_guard_price_history ON product_price_history;
CREATE TRIGGER trg_guard_price_history BEFORE UPDATE OR DELETE ON product_price_history
  FOR EACH ROW EXECUTE FUNCTION fn_guard_price_history();

-- Point-in-time lookup (NULL when no price existed at that time)
DROP FUNCTION IF EXISTS sp_get_product_price_at(INT, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION sp_get_product_price_at(p_id INT, query_time TIMESTAMPTZ) RETURNS NUMERIC AS $$
  SELECT price FROM product_price_history
   WHERE product_id = p_id AND valid_from <= query_time AND (valid_to IS NULL OR query_time < valid_to)
   ORDER BY valid_from DESC LIMIT 1;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION sp_get_price_history(p_id INT)
RETURNS TABLE(id INT, price NUMERIC, valid_from TIMESTAMPTZ, valid_to TIMESTAMPTZ) AS $$
  SELECT id, price, valid_from, valid_to FROM product_price_history WHERE product_id = p_id ORDER BY valid_from;
$$ LANGUAGE sql STABLE;

-- 2. Append-only hash-chained ledger ------------------------------------------
CREATE OR REPLACE FUNCTION fn_chain_ledger_transaction() RETURNS TRIGGER AS $$
DECLARE last_hash TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(727001);           -- serialise writers so the chain cannot fork
  SELECT curr_hash INTO last_hash FROM ledger_transactions ORDER BY id DESC LIMIT 1;
  IF last_hash IS NULL THEN last_hash := repeat('0', 64); END IF;
  NEW.created_at := now();
  NEW.prev_hash  := last_hash;
  NEW.curr_hash  := encode(digest(last_hash || '|' || NEW.order_id::text || '|' || NEW.amount::text || '|' || NEW.created_at::text, 'sha256'), 'hex');
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_ledger_hash_chain ON ledger_transactions;
CREATE TRIGGER trg_ledger_hash_chain BEFORE INSERT ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION fn_chain_ledger_transaction();

CREATE OR REPLACE FUNCTION fn_ledger_immutable() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'ledger_transactions is append-only: % not allowed', TG_OP; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_ledger_no_mutation ON ledger_transactions;
CREATE TRIGGER trg_ledger_no_mutation BEFORE UPDATE OR DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION fn_ledger_immutable();
DROP TRIGGER IF EXISTS trg_ledger_no_truncate ON ledger_transactions;
CREATE TRIGGER trg_ledger_no_truncate BEFORE TRUNCATE ON ledger_transactions
  FOR EACH STATEMENT EXECUTE FUNCTION fn_ledger_immutable();

-- Recompute the whole chain; returns one row per broken link (empty = intact)
CREATE OR REPLACE FUNCTION sp_verify_ledger()
RETURNS TABLE(ledger_id INT, problem TEXT) AS $$
DECLARE r RECORD; expected_prev TEXT := repeat('0', 64); expected_hash TEXT;
BEGIN
  FOR r IN SELECT * FROM ledger_transactions ORDER BY id LOOP
    expected_hash := encode(digest(expected_prev || '|' || r.order_id::text || '|' || r.amount::text || '|' || r.created_at::text, 'sha256'), 'hex');
    IF r.prev_hash IS DISTINCT FROM expected_prev THEN ledger_id := r.id; problem := 'prev_hash does not match predecessor'; RETURN NEXT; END IF;
    IF r.curr_hash IS DISTINCT FROM expected_hash THEN ledger_id := r.id; problem := 'curr_hash does not match row contents'; RETURN NEXT; END IF;
    expected_prev := r.curr_hash;
  END LOOP;
END; $$ LANGUAGE plpgsql STABLE;

-- 3. Orders: transactional placement, stock guard, inventory log ---------------
-- Every stock movement is logged by trigger so stock_quantity can never drift silently.
CREATE OR REPLACE FUNCTION sp_place_order(p_customer INT, p_items JSONB) RETURNS INT AS $$
DECLARE v_order INT; v_total NUMERIC := 0; it JSONB; v_pid INT; v_qty INT; v_price_id INT; v_price NUMERIC;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'order needs at least one item'; END IF;
  INSERT INTO orders(customer_id, total_amount, status) VALUES (p_customer, 0, 'PENDING') RETURNING id INTO v_order;
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (it->>'productId')::INT; v_qty := (it->>'quantity')::INT;
    SELECT id, price INTO v_price_id, v_price FROM product_price_history
      WHERE product_id = v_pid AND valid_from <= now() AND (valid_to IS NULL OR now() < valid_to) ORDER BY valid_from DESC LIMIT 1;
    IF v_price_id IS NULL THEN RAISE EXCEPTION 'no active price for product %', v_pid; END IF;
    UPDATE products SET stock_quantity = stock_quantity - v_qty WHERE id = v_pid;   -- CHECK(stock>=0) rejects oversell
    IF NOT FOUND THEN RAISE EXCEPTION 'unknown product %', v_pid; END IF;
    INSERT INTO order_items(order_id, product_id, historical_price_id, quantity, subtotal) VALUES (v_order, v_pid, v_price_id, v_qty, v_price * v_qty);
    INSERT INTO inventory_logs(product_id, changed_by_user_id, qty_delta, reason) VALUES (v_pid, p_customer, -v_qty, 'ORDER #' || v_order);
    v_total := v_total + v_price * v_qty;
  END LOOP;
  UPDATE orders SET total_amount = v_total WHERE id = v_order;
  RETURN v_order;
END; $$ LANGUAGE plpgsql;

-- Paying an order writes the ledger entry (hash-chained by trigger)
CREATE OR REPLACE FUNCTION sp_pay_order(p_order INT) RETURNS VOID AS $$
DECLARE v_amt NUMERIC;
BEGIN
  UPDATE orders SET status = 'PAID' WHERE id = p_order AND status = 'PENDING' RETURNING total_amount INTO v_amt;
  IF NOT FOUND THEN RAISE EXCEPTION 'order % is not payable', p_order; END IF;
  INSERT INTO ledger_transactions(order_id, amount) VALUES (p_order, v_amt);
END; $$ LANGUAGE plpgsql;

-- Manager restock / adjustment with audit row
CREATE OR REPLACE FUNCTION sp_adjust_stock(p_product INT, p_user INT, p_delta INT, p_reason TEXT) RETURNS VOID AS $$
BEGIN
  UPDATE products SET stock_quantity = stock_quantity + p_delta WHERE id = p_product;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown product %', p_product; END IF;
  INSERT INTO inventory_logs(product_id, changed_by_user_id, qty_delta, reason) VALUES (p_product, p_user, p_delta, p_reason);
END; $$ LANGUAGE plpgsql;

CREATE INDEX IF NOT EXISTS idx_inventory_product_time ON inventory_logs(product_id, timestamp);

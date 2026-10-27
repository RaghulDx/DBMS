CREATE OR REPLACE FUNCTION sp_get_product_price_at(
    p_product_id BIGINT,
    p_time TIMESTAMPTZ
)
RETURNS NUMERIC
LANGUAGE SQL
AS $$
    SELECT price
    FROM product_price_history
    WHERE product_id = p_product_id
      AND valid_from <= p_time
      AND (valid_to IS NULL OR p_time < valid_to)
    ORDER BY valid_from DESC
    LIMIT 1;
$$;
-- demo catalog + price history (users are seeded by backend: npm run seed)
INSERT INTO categories(name,slug) VALUES ('Electronics','electronics'),('Books','books'),('Apparel','apparel') ON CONFLICT DO NOTHING;
INSERT INTO products(category_id,sku,name,stock_quantity)
SELECT c.id,v.sku,v.name,v.stock FROM (VALUES
 ('electronics','EL-001','Noise-Cancelling Headphones',50),
 ('electronics','EL-002','Mechanical Keyboard',30),
 ('books','BK-001','Database System Concepts',100),
 ('apparel','AP-001','Hoodie',75)) v(cat,sku,name,stock) JOIN categories c ON c.slug=v.cat
ON CONFLICT (sku) DO NOTHING;
INSERT INTO product_price_history(product_id,price,valid_from)
SELECT p.id, v.price, v.ts::timestamptz FROM (VALUES
 ('EL-001',199.00,'2026-01-01'),('EL-001',179.00,'2026-06-01'),('EL-001',149.00,'2026-09-01'),
 ('EL-002',89.00,'2026-01-01'),('EL-002',99.00,'2026-05-01'),
 ('BK-001',60.00,'2026-01-01'),('AP-001',35.00,'2026-01-01'),('AP-001',29.00,'2026-08-01')) v(sku,price,ts)
JOIN products p ON p.sku=v.sku
WHERE NOT EXISTS (SELECT 1 FROM product_price_history h WHERE h.product_id=p.id) OR false
ORDER BY v.ts;

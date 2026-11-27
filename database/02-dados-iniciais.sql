-- Dados fictícios para os experimentos.

-- Tarifas ilustrativas (R$/kWh)
INSERT INTO tarifa (tipo, valor_kwh) VALUES
    ('residencial', 0.8000),
    ('comercial',   0.7500),
    ('industrial',  0.6000);

-- 200 medidores: 60% residenciais, 30% comerciais, 10% industriais.
-- Os múltiplos de 25 (25, 50, ..., 200) estão DESATIVADOS: um pedido para eles
-- é aceito pela API, mas o worker o encerra com status "erro" (erro de negócio).
INSERT INTO medidor (id, tipo, descricao, ativo)
SELECT n,
       CASE WHEN n % 10 < 6 THEN 'residencial'
            WHEN n % 10 < 9 THEN 'comercial'
            ELSE 'industrial' END,
       'Medidor ' || lpad(n::text, 3, '0'),
       n % 25 <> 0
FROM generate_series(1, 200) AS n;

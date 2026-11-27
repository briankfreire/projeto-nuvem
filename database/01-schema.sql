-- =====================================================================
-- WattReport - esquema do banco (PostgreSQL 17)
--
-- O PostgreSQL é a FONTE DA VERDADE. A fila do RabbitMQ só carrega avisos
-- de trabalho; o estado oficial de cada relatório está aqui.
--
-- Executado automaticamente pelo container do Postgres na PRIMEIRA subida
-- (quando o volume de dados ainda está vazio).
-- =====================================================================

-- Tarifa por tipo de consumidor. Dinheiro em NUMERIC, nunca em float.
CREATE TABLE tarifa (
    tipo        TEXT PRIMARY KEY
                CHECK (tipo IN ('residencial', 'comercial', 'industrial')),
    valor_kwh   NUMERIC(6, 4) NOT NULL CHECK (valor_kwh > 0)
);

-- Medidores cadastrados. O tipo (e portanto a tarifa) vem do banco,
-- e não do cliente: o cliente informa apenas o número do medidor.
CREATE TABLE medidor (
    id          INTEGER PRIMARY KEY CHECK (id > 0),
    tipo        TEXT    NOT NULL REFERENCES tarifa (tipo),
    descricao   TEXT    NOT NULL,
    ativo       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE relatorio (
    id                  UUID        PRIMARY KEY,
    request_id          TEXT        NOT NULL,
    -- Idempotency-Key enviada pelo cliente: repetir o POST não cria outro relatório
    idempotency_key     TEXT        UNIQUE,
    medidor_id          INTEGER     NOT NULL REFERENCES medidor (id),
    mes                 CHAR(7)     NOT NULL CHECK (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    -- tipo e tarifa COPIADOS no momento do pedido: mudar a tarifa depois
    -- não altera relatórios já pedidos (mesma ideia do preço no item do pedido)
    tipo                TEXT        NOT NULL REFERENCES tarifa (tipo),
    tarifa_kwh          NUMERIC(6, 4) NOT NULL CHECK (tarifa_kwh > 0),

    status              TEXT        NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente', 'processando', 'concluido', 'erro')),
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- OUTBOX: fica NULL até o RabbitMQ confirmar o recebimento da mensagem
    publicado_em        TIMESTAMPTZ,
    iniciado_em         TIMESTAMPTZ,
    concluido_em        TIMESTAMPTZ,
    processado_por      TEXT,
    tentativas          INTEGER     NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
    erro                TEXT,

    -- resultado (preenchido pelo worker)
    consumo_total_kwh   NUMERIC(12, 2) CHECK (consumo_total_kwh >= 0),
    custo_estimado      NUMERIC(12, 2) CHECK (custo_estimado >= 0),
    media_diaria_kwh    NUMERIC(12, 2) CHECK (media_diaria_kwh >= 0),
    pico_kw             NUMERIC(10, 2) CHECK (pico_kw >= 0),
    pico_em             TIMESTAMPTZ,
    consumo_diario_kwh  NUMERIC(10, 2)[],
    leituras            INTEGER     CHECK (leituras >= 0),
    duracao_ms          INTEGER     CHECK (duracao_ms >= 0),

    CONSTRAINT concluido_tem_resultado CHECK (
        status <> 'concluido'
        OR (consumo_total_kwh IS NOT NULL AND custo_estimado IS NOT NULL AND concluido_em IS NOT NULL)
    ),
    CONSTRAINT erro_tem_motivo CHECK (status <> 'erro' OR erro IS NOT NULL)
);

-- Índices para as consultas frequentes
CREATE INDEX relatorio_status_idx     ON relatorio (status);
CREATE INDEX relatorio_criado_em_idx  ON relatorio (criado_em DESC);
-- Índice PARCIAL usado pelo reconciliador: só os ainda não publicados
CREATE INDEX relatorio_nao_publicado_idx ON relatorio (criado_em) WHERE publicado_em IS NULL;

-- atualizado_em é mantido pelo banco, não pelo código da aplicação
CREATE FUNCTION atualizar_atualizado_em() RETURNS trigger AS $$
BEGIN
    NEW.atualizado_em := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER relatorio_atualizado_em
    BEFORE UPDATE ON relatorio
    FOR EACH ROW EXECUTE FUNCTION atualizar_atualizado_em();

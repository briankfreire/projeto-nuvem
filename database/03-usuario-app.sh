#!/bin/sh
# Cria o usuário usado pela aplicação (Serviço A e Serviço B).
#
# PRIVILÉGIO MÍNIMO: a aplicação não usa o superusuário do Postgres.
# Ela só pode ler e escrever linhas; não pode apagar tabelas, alterar o
# esquema nem excluir registros.
set -e   # (sem -u: o entrypoint do Postgres pode executar este arquivo com "source")

: "${APP_DB_USER:?defina APP_DB_USER}"
: "${APP_DB_PASSWORD:?defina APP_DB_PASSWORD}"

psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v app_user="$APP_DB_USER" -v app_pass="$APP_DB_PASSWORD" -v db="$POSTGRES_DB" <<'EOSQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_pass';
GRANT CONNECT ON DATABASE :"db" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";

-- catálogo: somente leitura
GRANT SELECT ON tarifa, medidor TO :"app_user";

-- relatórios: ler, inserir e atualizar (sem DELETE)
GRANT SELECT, INSERT, UPDATE ON relatorio TO :"app_user";
EOSQL

echo "Usuário da aplicação '$APP_DB_USER' criado com privilégio mínimo."

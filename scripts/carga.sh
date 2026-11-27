#!/usr/bin/env bash
# Gerador de carga: simula vários clientes pedindo relatórios ao mesmo tempo.
# Cada pedido leva uma Idempotency-Key própria e é repetido (com a MESMA chave)
# em caso de falha de rede, 429 ou 5xx.
#
# Uso: ./scripts/carga.sh [QUANTIDADE] [PARALELO] [URL]
#   ./scripts/carga.sh               # 100 pedidos, 10 em paralelo, http://localhost:8080
#   ./scripts/carga.sh 400 20        # carga para o HPA
set -euo pipefail

QTD="${1:-100}"
PARALELO="${2:-10}"
URL="${3:-http://localhost:8080}"
MES="$(date +%Y-%m)"

echo "Enviando $QTD pedidos para $URL/api/relatorios ($PARALELO em paralelo)..."

seq 1 "$QTD" | xargs -P "$PARALELO" -I{} sh -c '
  medidor=$(( ( $(od -An -N2 -tu2 /dev/urandom) % 200 ) + 1 ))
  chave=$(cat /proc/sys/kernel/random/uuid)
  for tentativa in 1 2 3; do
    codigo=$(curl -s -o /dev/null -w "%{http_code}" -X POST "'"$URL"'/api/relatorios" \
      -H "Content-Type: application/json" -H "Idempotency-Key: $chave" \
      -d "{\"medidor\":$medidor,\"mes\":\"'"$MES"'\"}") || codigo=000
    case "$codigo" in 000|429|5??) sleep "0.$tentativa" ;; *) break ;; esac
  done
  echo "$codigo"
' | sort | uniq -c | sed 's/^/  respostas HTTP: /'

echo "Acompanhe com: ./scripts/acompanhar.sh $URL"

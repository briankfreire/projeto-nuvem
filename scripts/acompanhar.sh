#!/usr/bin/env bash
# Painel no terminal: mostra a cada 2 s os números do banco e da fila.
# Uso: ./scripts/acompanhar.sh [URL]      (Ctrl+C para sair)
URL="${1:-http://localhost:8080}"
while true; do
  clear
  echo "WattReport · $(date +%T) · $URL"
  echo "----------------------------------------------"
  curl -s "$URL/api/relatorios/stats" | sed -e 's/[{}"]//g' -e 's/,/\n/g' -e 's/fila:/fila -> /'
  echo
  sleep 2
done

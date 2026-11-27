#!/usr/bin/env bash
# Constrói as imagens do Serviço A e do Serviço B DENTRO do Docker do Minikube.
# (O Minikube tem um armazenamento de imagens próprio; imagens construídas no
#  Docker normal não aparecem para o cluster e os Pods ficariam em ErrImagePull.)
set -euo pipefail
cd "$(dirname "$0")/.."

eval "$(minikube docker-env)"
docker build -t wattreport/servico-a:2.0.0 ./servico-a
docker build -t wattreport/servico-b:2.0.0 ./servico-b
echo "Imagens prontas no Minikube:"
docker images | grep wattreport

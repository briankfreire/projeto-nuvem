# Guia passo a passo (o que vocês fazem manualmente)

Guia prático para o **grupo**. A explicação técnica para o professor está no `README.md`.
Comandos em blocos `bash` rodam no **terminal Linux**: na VM, ou no Ubuntu do WSL 2 no Windows, como no material do professor.

---

## Parte 1: Preparar o ambiente (uma vez só)

### Opção A: no seu PC com Windows (WSL 2, igual ao material de apoio)
No **PowerShell como administrador**:
```powershell
wsl --install -d Ubuntu-24.04
wsl -l -v        # a coluna VERSION tem que ser 2
```
Reinicie, abra o **Ubuntu** pelo menu Iniciar e crie o usuário Linux. Daqui em diante, tudo é feito **dentro do Ubuntu**.

> Se tiver Docker Desktop instalado, desative a integração dele com essa distribuição (Settings → Resources → WSL integration) para não ter dois Dockers brigando.

### Opção B: direto na VM Linux do professor
Conecte pelo VS Code: extensão **Remote - SSH** → `F1` → *Remote-SSH: Connect to Host* → `usuario@ip-da-vm`.

### Pacotes básicos e Docker (Ubuntu, na opção A ou B)
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ca-certificates gnupg unzip

# Docker pelo repositório oficial (mesmos comandos do material do professor)
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker $USER     # depois FECHE e ABRA o terminal (no WSL: wsl --shutdown)
docker run --rm hello-world
```
No WSL, se `docker ps` disser que o daemon não está rodando, coloque no `/etc/wsl.conf`:
```
[boot]
systemd=true
```
Depois rode `wsl --shutdown` no PowerShell e abra o Ubuntu de novo.

### Node.js 22 (só para rodar os testes fora do Docker)
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# feche e abra o terminal
nvm install 22
node --version
```

---

## Parte 2: Colocar o projeto no lugar

1. Baixe o `projeto-nuvem-v2.zip`.
2. Copie e descompacte **dentro do Linux** (não em `C:\`, para não ter problema de permissão e de CRLF):
   ```bash
   cp /mnt/c/Users/<seu-usuario-windows>/Downloads/projeto-nuvem-v2.zip ~
   cd ~ && unzip projeto-nuvem-v2.zip && cd projeto-nuvem
   code .        # abre no VS Code (no WSL, ele instala a extensão WSL sozinho)
   ```
3. Se vocês já tinham um repositório com a versão anterior, substituam o conteúdo pela pasta nova e façam um commit "Backend v2: PostgreSQL, outbox e quorum queue".

**O que mudou no seu front:** o visual é o mesmo. O formulário agora tem só **Medidor** e **Mês**, porque tipo e tarifa vêm do cadastro do banco (medidores de 1 a 200). Os relatórios ganharam o status **erro**.

### Rodar os testes
```bash
cd servico-a && npm install && npm test     # 17 passed
cd ../servico-b && npm install && npm test  # 10 passed
cd ..
```

---

## Parte 3: Git e GitHub

O histórico precisa mostrar **a participação de cada integrante**. Dividam os commits por parte:

```bash
git init && git branch -M main
git add .gitignore .gitattributes .env.example database/        && git commit -m "Banco: esquema, dados iniciais e usuário com privilégio mínimo"
git add servico-a/                                               && git commit -m "Serviço A: API, outbox, reconciliador e idempotência"
git add servico-b/                                               && git commit -m "Serviço B: worker, dead-letter e falha simulada"
git add nginx/                                                   && git commit -m "NGINX e front-end"
git add compose.yml scripts/                                     && git commit -m "Docker Compose e scripts de carga"
git add kustomization.yaml k8s/                                  && git commit -m "Kubernetes com Kustomize e HPA"
git add README.md GUIA.md                                        && git commit -m "Documentação"
git remote add origin https://github.com/<usuario>/projeto-nuvem.git
git push -u origin main
```
> ⚠️ O `.env` **nunca** vai para o Git (já está no `.gitignore`).

---

## Parte 4: Etapa 1, Docker Compose

```bash
cp .env.example .env
nano .env                 # troque as 3 senhas (só letras e números, sem comentário na linha)
docker compose config     # se faltar variável, ele avisa aqui
docker compose up -d --build     # 1ª vez demora: baixa 4 imagens e compila 2
docker compose ps                # todos "healthy"
```
Abra **http://localhost:8080** (WSL) ou **http://IP-DA-VM:8080** (VM).
Se a porta da VM estiver bloqueada, use um túnel no **seu PC**: `ssh -L 8080:localhost:8080 usuario@ip-da-vm`.

**Painel do RabbitMQ:** http://localhost:15672 (usuário e senha do `.env`). Na VM, use o túnel `ssh -L 15672:localhost:15672 ...`.
- **Ready**: mensagens esperando worker
- **Unacked**: mensagens entregues e ainda não confirmadas
- **Consumers**: workers conectados

**Acompanhar no terminal:**
```bash
./scripts/acompanhar.sh          # painel que atualiza a cada 2 s (Ctrl+C sai)
docker compose logs -f servico-b
docker compose logs | grep <requestId>
docker compose exec postgres psql -U wattreport_admin -d wattreport -c "select status, count(*) from relatorio group by 1"
```

---

## Parte 5: Roteiro de demonstração da etapa 1

Deixe abertos o front, o painel do RabbitMQ e um terminal com `./scripts/acompanhar.sh`.

**1. Funcionamento normal.** Gere um relatório no front. Mostre o `requestId` na mensagem verde e depois:
```bash
docker compose logs | grep <requestId>
```
Aparecem o NGINX, o Serviço A (criado → publicado) e o worker (recebida → iniciado → concluído).

**2. Fila acumulando sem worker**
```bash
docker compose stop servico-b
./scripts/carga.sh 5 1
```
No painel: Consumers 0, Ready ≈ 5. No front: *workers B: 0*.
```bash
docker compose start servico-b
```
Ready cai a 0 e tudo conclui. **Explicação:** a fila guarda os avisos (quorum queue + mensagem persistente) até um consumidor aparecer.

**3. Escala de consumidores**
```bash
docker compose up -d --scale servico-b=1
./scripts/carga.sh 60 10
docker compose up -d --scale servico-b=4     # enquanto ainda tem fila
```
Consumers passa de 1 para 4 e a fila esvazia bem mais rápido. Com `prefetch = 1`, cada worker segura só uma mensagem por vez.

**4. Worker morto no meio do trabalho**
```bash
./scripts/carga.sh 10 2
docker compose kill -s SIGKILL servico-b
docker compose up -d servico-b
```
As mensagens Unacked voltam a Ready. O relatório que estava no meio termina com **tentativas: 2**, sem ser processado duas vezes (idempotência + `FOR UPDATE`).

**5. Desligamento gracioso**
```bash
./scripts/carga.sh 10 2
docker compose stop servico-b
docker compose logs servico-b | tail -5
docker compose start servico-b
```
Nos logs: `processo.encerrando` → `processamento.concluido` → `processo.encerrado`.

**6. Falha técnica e dead-letter**
```bash
TAXA_FALHA_SIMULADA=0.5 docker compose up -d servico-b
./scripts/carga.sh 20 5
```
No painel, **Redelivered** cresce. Alguns relatórios ficam em *erro*, com o motivo "Esgotou o limite de 5 reentregas". Para voltar ao normal:
```bash
docker compose up -d servico-b
```

**7. RabbitMQ fora do ar**
```bash
docker compose stop rabbitmq
./scripts/carga.sh 5 1          # continua 202!
```
No front: *RabbitMQ desconectado · aguardando publicação: 5*. Os workers reiniciam em loop, o que é esperado (fail fast).
```bash
docker compose start rabbitmq
```
Em cerca de 15 s o reconciliador publica as pendências (`reconciliador.republicado` nos logs) e tudo conclui.

**8. Erro de negócio**
```bash
curl -s -X POST localhost:8080/api/relatorios -H 'Content-Type: application/json' -d '{"medidor":25,"mes":"2026-10"}'
```
Fica em *erro* ("Medidor 25 está desativado") **sem reentregas**, porque repetir não muda a realidade.

**9. Cliente repete o POST (idempotência)**
```bash
CHAVE=$(cat /proc/sys/kernel/random/uuid)
for i in 1 2; do
  curl -s -i -X POST http://localhost:8080/api/relatorios \
    -H 'Content-Type: application/json' -H "Idempotency-Key: $CHAVE" \
    -d '{"medidor":42,"mes":"2026-10"}' | head -1
done
```
O primeiro responde `202 Accepted` e o segundo `200 OK`, com o mesmo id.

**Recomeçar do zero** (apaga banco e filas): `docker compose down -v && docker compose up -d`

---

## Parte 6: Etapas 2 e 3, Kubernetes (Minikube)

### Instalar (uma vez)
```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl && rm kubectl

curl -LO https://github.com/kubernetes/minikube/releases/latest/download/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube && rm minikube-linux-amd64
```

### Subir
```bash
docker compose down                                   # libera a porta 8080 e memória
minikube start --driver=docker --cpus=4 --memory=6g   # pouca RAM? use --cpus=2 --memory=4g
minikube addons enable metrics-server                 # necessário para o HPA
minikube addons enable ingress                        # para usar o Ingress (enunciado)

./scripts/k8s-imagens.sh       # build das imagens DENTRO do Docker do Minikube
kubectl apply -k .             # Kustomize: aplica tudo (gera ConfigMaps e Secret do .env)
kubectl get pods -n wattreport -w
```
Todos devem chegar a `1/1 Running`. É normal o `servico-b` reiniciar algumas vezes enquanto o RabbitMQ sobe.

### Acessar (em terminais separados)
```bash
kubectl port-forward -n wattreport svc/nginx 8080:80 --address 0.0.0.0
kubectl port-forward -n wattreport svc/rabbitmq 15672:15672
```
Front em http://localhost:8080 (ou http://IP-DA-VM:8080). Pelo Ingress: `curl http://$(minikube ip)/api/relatorios/stats`.

### Demonstrações
**Escala manual**
```bash
kubectl scale deployment servico-b -n wattreport --replicas=1
./scripts/carga.sh 100 10
kubectl scale deployment servico-b -n wattreport --replicas=5
kubectl get pods -n wattreport -l app=servico-b
```
Consumers vai para 5 e Unacked pode chegar a 5.

**Self-healing e reentrega**
```bash
kubectl delete pod -n wattreport -l app=servico-b --grace-period=0 --force
kubectl get pods -n wattreport -w
```

**Fila sem consumidores e retomada**
```bash
kubectl scale deployment servico-b -n wattreport --replicas=0
kubectl scale deployment servico-b -n wattreport --replicas=1
```

**Atualização gradual da API**
```bash
kubectl rollout restart deployment servico-a -n wattreport
kubectl rollout status deployment servico-a -n wattreport
```

**Logs de todas as réplicas**
```bash
kubectl logs -n wattreport -l app=servico-b -f --prefix
```

**Elasticidade (HPA)**
```bash
kubectl scale deployment servico-b -n wattreport --replicas=1
kubectl apply -f k8s/hpa-servico-b.yaml
kubectl get hpa -n wattreport -w                       # terminal 1
kubectl get pods -n wattreport -l app=servico-b -w     # terminal 2
./scripts/carga.sh 400 20                              # terminal 3
```
As réplicas sobem até 5. Quando a fila esvazia, descem uma a uma (janela de 60 s). Se TARGETS mostrar `<unknown>`, espere 1 a 2 minutos pelo metrics-server.

**Mudar configuração** (ex.: `TAXA_FALHA_SIMULADA` no `kustomization.yaml`):
```bash
kubectl apply -k .     # o hash do ConfigMap muda e os Pods são recriados sozinhos
```

### Desligar
```bash
minikube stop       # mantém os dados
minikube delete     # apaga o cluster
```

---

## Parte 7: Problemas comuns

| Sintoma | Causa | Solução |
|---|---|---|
| `wsl -l -v` mostra VERSION 1 | WSL 1 | `wsl --set-version Ubuntu-24.04 2` |
| `Cannot connect to the Docker daemon` | daemon parado ou systemd desligado | revisar `/etc/wsl.conf` e `wsl --shutdown` |
| `permission denied` no docker | sessão sem o grupo docker | fechar e abrir o terminal |
| `defina ... no .env` | `.env` não criado | `cp .env.example .env` |
| Mudou senha no `.env` e nada funciona | banco e RabbitMQ já foram criados com a senha antiga | `docker compose down -v` e subir de novo |
| Porta 8080 em uso | outro programa (ou o port-forward) | `PORTA_APP=8081` no `.env` |
| `/bin/bash^M: bad interpreter` | arquivo com CRLF | VS Code: trocar para LF; descompactar dentro do Linux |
| Só um worker trabalha depois de escalar | fila já tinha esvaziado | gere mais carga (`./scripts/carga.sh 100 10`) |
| Worker reiniciando em loop | RabbitMQ fora ou senha errada | `docker compose logs servico-b` |
| `ErrImagePull` / `ImagePullBackOff` | imagem construída fora do Minikube | `./scripts/k8s-imagens.sh` de novo |
| Pods em `Pending` | pouca memória | recriar o Minikube com mais memória |
| `CrashLoopBackOff` | erro na partida | `kubectl logs -n wattreport <pod> --previous` |
| Mudou o `.env` e o K8s não pegou | Secret não reaplicado | `kubectl apply -k .` |
| port-forward parou | Pod recriado | rode o port-forward de novo |

---

## Parte 8: Confirmar com o professor
1. Na etapa 2, ele quer o **Ingress Controller** (enunciado) ou o **NGINX próprio com port-forward** (material)? O projeto atende os dois.
2. Os experimentos vão ser na VM dele ou no WSL de cada um?
3. Formato da entrega: repositório, vídeo ou apresentação ao vivo?

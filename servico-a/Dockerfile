# ---------- Etapa 1 (build): instala tudo e compila o TypeScript ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---------- Etapa 2 (final): só dependências de produção + JS compilado ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# roda como usuário comum (node), nunca como root
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health/ready || exit 1
# "node" direto (e não "npm start"): o processo Node recebe o SIGTERM e encerra com calma
CMD ["node", "dist/server.js"]

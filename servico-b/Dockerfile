# ---------- Etapa 1 (build) ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---------- Etapa 2 (final) ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HEALTH_PORT=8081
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
# 8081 = só health check interno (o worker não recebe requisições de clientes)
EXPOSE 8081
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8081/health || exit 1
CMD ["node", "dist/main.js"]

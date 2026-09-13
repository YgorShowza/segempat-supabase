# API SEGEMPAT — imagem de produção
# Build a partir da RAIZ do repositório:
#   docker build -f server/Dockerfile -t segempat-api:1.0.0 .
# O contexto precisa ser a raiz porque as migrations vivem em database/mysql.

FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Dependências primeiro (cache de camada)
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Código da API e schema/migrations
COPY server/src ./src
COPY server/scripts ./scripts
COPY database/mysql ../database/mysql

# Storage privado de assinaturas/evidências (monte um volume neste caminho)
RUN mkdir -p /var/lib/segempat/storage && chown -R node:node /var/lib/segempat /app
VOLUME ["/var/lib/segempat/storage"]

USER node
EXPOSE 8787

# Healthcheck de produção usa readiness: só fica saudável quando processo HTTP,
# MySQL, TLS (quando exigido), migrations/schema e storage estiverem prontos.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]

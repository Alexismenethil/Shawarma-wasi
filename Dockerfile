# Shawarma Wasi: la web y la API en un solo contenedor.
# Sirve igual para Render, Railway, Fly.io o una mini PC en el local.

FROM node:22-slim AS base
WORKDIR /app
# El motor de migraciones de Prisma necesita OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS construir
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/prisma.config.ts backend/
COPY backend/prisma backend/prisma
COPY frontend/package.json frontend/
RUN npm ci --include=dev
COPY . .
RUN npm run build && npm prune --omit=dev

FROM base
ENV NODE_ENV=production
COPY --from=construir /app/package.json /app/package-lock.json ./
COPY --from=construir /app/node_modules node_modules
COPY --from=construir /app/shared shared
COPY --from=construir /app/backend/package.json /app/backend/prisma.config.ts backend/
COPY --from=construir /app/backend/prisma backend/prisma
COPY --from=construir /app/backend/dist backend/dist
COPY --from=construir /app/frontend/dist frontend/dist
EXPOSE 4310
# Aplica las migraciones pendientes y arranca.
CMD ["npm", "start"]

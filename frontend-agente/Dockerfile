# Frontend Next.js (salida "standalone": la imagen final solo trae lo necesario para correr).
FROM node:22-bookworm-slim AS build
WORKDIR /app
# next.config.ts lee BACKEND_URL al construir: a dónde se reenvía /api/*.
ARG BACKEND_URL=http://backend-agente:4000
ENV BACKEND_URL=$BACKEND_URL NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]

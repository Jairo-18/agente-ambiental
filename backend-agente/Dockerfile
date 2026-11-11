# Backend NestJS. Dos etapas: compila con todas las dependencias y deja solo las de producción.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
# Los gráficos del reporte se dibujan con resvg, que necesita una fuente del sistema para el texto.
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
# Claude Code: el chat lo ejecuta (`claude -p`, sin herramientas) para hablar con Claude usando la suscripción del usuario.
# La sesión llega por la variable CLAUDE_CODE_OAUTH_TOKEN (ver docker-compose.yml).
RUN npm install -g @anthropic-ai/claude-code && npm cache clean --force
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
# La norma (YAML) va dentro de la imagen; los datos y los reportes se montan como volúmenes (ver docker-compose.yml).
COPY --chown=node:node knowledge ./knowledge
COPY --chown=node:node data ./data
RUN mkdir -p storage/reports && chown -R node:node storage
USER node
EXPOSE 4000
# Las migraciones de TypeORM corren solas al arrancar (migrationsRun).
CMD ["node", "dist/main.js"]

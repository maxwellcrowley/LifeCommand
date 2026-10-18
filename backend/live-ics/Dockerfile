FROM node:24.16.0-bookworm-slim AS build
WORKDIR /app/backend/live-ics
COPY backend/live-ics/package*.json ./
RUN npm ci --ignore-scripts
COPY backend/live-ics/tsconfig.json ./
COPY backend/live-ics/scripts ./scripts
COPY src/domain /app/src/domain
RUN ln -s /app/backend/live-ics/node_modules /app/node_modules && npm run build && npm prune --omit=dev

FROM node:24.16.0-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 TZ=UTC
WORKDIR /app/backend/live-ics
COPY --from=build /app/backend/live-ics/node_modules ./node_modules
COPY --from=build /app/backend/live-ics/.build ./.build
COPY backend/live-ics/package.json ./
COPY backend/live-ics/src ./src
COPY backend/live-ics/scripts/rotate-secrets.mjs ./scripts/rotate-secrets.mjs
USER node
EXPOSE 8787
CMD ["node", "src/server.mjs"]

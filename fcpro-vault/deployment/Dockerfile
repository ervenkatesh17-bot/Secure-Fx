FROM node:20-alpine AS builder

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/nest-cli.json backend/tsconfig.json ./
COPY backend/src ./src

RUN npx nest build
RUN npm prune --production

FROM node:20-alpine AS production

RUN apk add --no-cache dumb-init curl \
  && addgroup -g 1001 -S appgroup \
  && adduser -u 1001 -S appuser -G appgroup

WORKDIR /app/backend

ENV NODE_ENV=production

COPY --from=builder --chown=appuser:appgroup /app/backend/package*.json ./
COPY --from=builder --chown=appuser:appgroup /app/backend/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/backend/dist ./dist

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]

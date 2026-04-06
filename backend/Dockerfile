# ──────────────────────────────────────────────────────────
# Stage: development
# Uses ts-node-dev for hot-reload in dev mode.
# Production build would use a multi-stage with `npm run build`.
# ──────────────────────────────────────────────────────────
FROM node:20-alpine

# System deps for Prisma binary (OpenSSL)
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm install

# Copy Prisma schema so the client can be generated at build time
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest of source code
# (src/ is also volume-mounted for hot reload so this is mainly for reference)
COPY . .

EXPOSE 3000

# Entrypoint: run migrations then start dev server
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:dev"]

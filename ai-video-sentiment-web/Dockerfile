FROM node:20-slim

# Prisma needs OpenSSL at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN SKIP_ENV_VALIDATION=1 NEXT_TELEMETRY_DISABLED=1 npx next build --no-lint

# The SQLite database lives in /app/data so it can be kept in a volume.
RUN mkdir -p /app/data
VOLUME /app/data

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:/app/data/db.sqlite \
    PORT=3000

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push --skip-generate && npx next start"]

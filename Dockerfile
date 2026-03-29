FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates openssl libssl-dev libstdc++6 libc6 \
    libgcc-s1 sqlite3 libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY dashboard/package.json dashboard/
RUN cd dashboard && npm install
COPY dashboard/ dashboard/
RUN cd dashboard && npm run build

COPY server/package.json server/
RUN cd server && npm install
COPY server/ server/
COPY package.json .

# Compile TypeScript to JavaScript
RUN cd server && npx tsc --outDir dist || true

WORKDIR /app/server

EXPOSE 8080

# Run compiled JS with plain node — no tsx
CMD ["node", "dist/index.js"]
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

# DEBUG: show the REAL error
RUN ldd server/node_modules/@xmtp/node-bindings/dist/bindings_node.linux-x64-gnu.node
RUN node -e "try{require('./server/node_modules/@xmtp/node-bindings');console.log('BINDING OK')}catch(e){console.error(e);process.exit(1)}"

COPY server/ server/
COPY package.json .

# CRITICAL: WORKDIR must be where node_modules live
WORKDIR /app/server

EXPOSE 8080

# CRITICAL: no npx, use local tsx directly
CMD ["node", "node_modules/.bin/tsx", "src/index.ts"]
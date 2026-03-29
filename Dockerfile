FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates openssl libssl-dev libstdc++6 libc6 \
    libgcc-s1 sqlite3 libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build dashboard
COPY dashboard/package.json dashboard/
RUN cd dashboard && npm install
COPY dashboard/ dashboard/
RUN cd dashboard && npm run build

# Install server deps
COPY server/package.json server/tsconfig.json server/
RUN cd server && npm install

# Verify native binding exists at build time
RUN ls -la /app/server/node_modules/@xmtp/node-bindings/dist/bindings_node.linux-x64-gnu.node \
    && echo "XMTP native binding found" \
    || echo "WARNING: XMTP binding not found"

COPY server/ server/
COPY package.json .

WORKDIR /app/server

# NAPI_RS env var tells the binding loader exactly where the .node file is
# This bypasses the platform detection that fails under tsx's CJS loader
ENV NAPI_RS_NATIVE_LIBRARY_PATH=/app/server/node_modules/@xmtp/node-bindings/dist/bindings_node.linux-x64-gnu.node
ENV NODE_ENV=production

EXPOSE 8080

CMD ["npx", "tsx", "src/index.ts"]

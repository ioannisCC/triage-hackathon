FROM node:22

WORKDIR /app

# Install dashboard
COPY dashboard/package.json dashboard/
RUN cd dashboard && npm install

# Build dashboard
COPY dashboard/ dashboard/
RUN cd dashboard && npm run build

# Install server (fresh, on Linux — picks up correct native bindings)
COPY server/package.json server/
RUN cd server && npm install
RUN ls -la server/node_modules/@xmtp/ && ls -la server/node_modules/@xmtp/node-bindings/ || echo "NO XMTP BINDINGS FOUND"

# Copy server source
COPY server/ server/

# Copy root package.json
COPY package.json .

EXPOSE 8080

CMD ["npx", "-y", "tsx", "server/src/index.ts"]
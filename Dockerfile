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
RUN cd server && node -e "try { require('@xmtp/node-bindings'); console.log('BINDINGS OK') } catch(e) { console.error('FULL ERROR:', e.message); console.error('CAUSE:', e.cause || 'none'); }"
RUN ls -la server/node_modules/@xmtp/node-bindings/dist/ && find server/node_modules/@xmtp -name "*.node" || echo "NO .node FILES"
RUN cat server/node_modules/@xmtp/node-bindings/package.json | grep -A 20 "optionalDependencies" || echo "NO OPTIONAL DEPS"

# Copy server source
COPY server/ server/

# Copy root package.json
COPY package.json .

EXPOSE 8080

WORKDIR /app/server
CMD ["sh", "-c", "node -e \"require('@xmtp/node-bindings'); console.log('RUNTIME BINDINGS OK')\" && npx tsx src/index.ts"]
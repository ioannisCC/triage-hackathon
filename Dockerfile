FROM node:22

WORKDIR /app

# Install & build dashboard
COPY dashboard/package.json dashboard/
RUN cd dashboard && npm install
COPY dashboard/ dashboard/
RUN cd dashboard && npm run build

# Install server
COPY server/package.json server/
RUN cd server && npm install

# Copy server source & compile TS to JS
COPY server/ server/
RUN cd server && npx tsc --outDir dist

# Copy root package.json
COPY package.json .

EXPOSE 8080

WORKDIR /app/server
CMD ["node", "dist/index.js"]
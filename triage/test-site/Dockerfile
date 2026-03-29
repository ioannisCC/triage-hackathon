FROM node:22-bookworm
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
CMD ["npx", "tsx", "server.ts"]

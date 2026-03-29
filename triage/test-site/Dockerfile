FROM node:22-bookworm
WORKDIR /app
COPY package.json package-lock.json* .
RUN npm install
COPY . .
RUN npm run build && ls dist/index.html && echo "BUILD OK"
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
CMD ["npx", "tsx", "server.ts"]

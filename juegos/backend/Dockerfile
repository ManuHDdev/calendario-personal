FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm ci && npm run build && npm prune --omit=dev
EXPOSE 3008
CMD ["node", "dist/index.js"]

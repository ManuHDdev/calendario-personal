FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN npm install && npm run build && npm prune --omit=dev
EXPOSE 3008
CMD ["node", "dist/index.js"]

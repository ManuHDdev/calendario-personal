# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Instalar dependencias primero (mejor uso de la caché de capas)
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --ignore-scripts

# Copiar el resto del código y compilar
COPY . .
RUN npx ng build --configuration production

# ─── Stage 2: Serve ──────────────────────────────────────────────────────────
FROM nginx:alpine AS runtime

# Eliminar la configuración por defecto de nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copiar nuestra configuración personalizada
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los artefactos del build (Angular 17+ genera en browser/)
COPY --from=build /app/dist/calendario-frontend/browser /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

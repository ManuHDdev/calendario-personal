FROM node:20-alpine

WORKDIR /app

# ffmpeg: usado por yt-dlp internamente para remux (mp4) y extracción de audio (mp3)
# curl: para descargar el binario estático de yt-dlp en build time
RUN apk add --no-cache ffmpeg curl

# yt-dlp: binario estático oficial para musl (yt-dlp_musllinux) — esta imagen
# es Alpine (musl libc), y ni el asset "yt-dlp" (script que necesita un
# intérprete python3 que esta imagen no instala) ni "yt-dlp_linux" (binario
# PyInstaller enlazado contra glibc, que Alpine no tiene) funcionan aquí.
# Fijado a un release concreto (no "latest") y verificado contra el
# SHA2-256SUMS que publica ese mismo release, para que un rebuild nunca confíe
# a ciegas en lo que GitHub sirva en ese momento.
# Actualizar el pin: revisar https://github.com/yt-dlp/yt-dlp/releases y repetir
# la verificación con el SHA2-256SUMS del nuevo tag.
RUN YTDLP_VERSION=2026.07.04 \
    && curl -L "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_musllinux" \
      -o /usr/local/bin/yt-dlp \
    && curl -L "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/SHA2-256SUMS" \
      -o /tmp/yt-dlp-SHA2-256SUMS \
    && (cd /usr/local/bin && grep -E '(^| )yt-dlp_musllinux$' /tmp/yt-dlp-SHA2-256SUMS | sed 's/yt-dlp_musllinux$/yt-dlp/' | sha256sum -c -) \
    && rm /tmp/yt-dlp-SHA2-256SUMS \
    && chmod a+rx /usr/local/bin/yt-dlp

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm ci && npm run build && npm prune --omit=dev

EXPOSE 3004

CMD ["node", "dist/index.js"]

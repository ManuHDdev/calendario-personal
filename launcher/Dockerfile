# The launcher has no build step: launcher.js and apps.json are served as-is.
# Tests run in CI (launcher-ci.yml) before this image is built.
FROM nginx:alpine
COPY public /usr/share/nginx/html/launcher
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

# Build the site from source, then serve it with nginx.
#
# The data of the site (ui/public/index.json, counts.json and sources/) is not in git: the first stage builds it from the
# Corpus Monodicum export, exactly as the deploy workflow does (see documentation/DATA.md). The image therefore holds the edition
# as it stood at build time; rebuild the image to refresh it.
FROM python:3.12-slim AS data
WORKDIR /app
COPY scripts/ scripts/
COPY glyphs/ glyphs/
RUN pip install --no-cache-dir ./scripts/ && python scripts/refresh_data.py

FROM node:22-alpine AS build
WORKDIR /app/ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci
COPY ui/ ./
COPY --from=data /app/ui/public/ ./public/
# vite writes the site to ../docs, i.e. /app/docs
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/docs /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

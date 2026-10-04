# Build the site from source, then serve it with nginx.
FROM node:22-alpine AS build
WORKDIR /app/ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci
COPY ui/ ./
# vite writes the site to ../docs, i.e. /app/docs
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/docs /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

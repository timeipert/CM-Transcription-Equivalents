FROM nginx:alpine

# Kopiert den lokal gebauten docs-Ordner in den NGINX-Webserver
COPY docs /usr/share/nginx/html

# Expose Port 80
EXPOSE 80

# Starte NGINX
CMD ["nginx", "-g", "daemon off;"]

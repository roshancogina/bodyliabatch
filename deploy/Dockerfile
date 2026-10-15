FROM nginx:alpine AS runtime
COPY dist/ /usr/share/nginx/html/
COPY deploy/nginx-batch-bodylia.conf /etc/nginx/conf.d/batch-bodylia.conf
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]

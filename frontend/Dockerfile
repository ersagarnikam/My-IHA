# Web image: the built SPA behind nginx, which proxies /api. Build context: frontend/
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_HOME_URL=https://medicaltourismaustralia.com
RUN VITE_HOME_URL="$VITE_HOME_URL" npm run build

FROM nginx:1.29-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html
# The image fills these into the template on start: the API's host:port, and the DNS server that
# finds it (127.0.0.11 is Docker's own).
ENV API_UPSTREAM=api:8080 DNS_RESOLVER=127.0.0.11
EXPOSE 80

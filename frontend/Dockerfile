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
# host:port of the API; the image fills this into the template on start.
ENV API_UPSTREAM=api:8080
EXPOSE 80

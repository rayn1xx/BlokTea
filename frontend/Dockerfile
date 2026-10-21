FROM node:22.18.0-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ARG USE_MOCKS=true
ARG DEMO_MODE=true
ENV USE_MOCKS=$USE_MOCKS DEMO_MODE=$DEMO_MODE
RUN npm run build

FROM nginx:1.27.2-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

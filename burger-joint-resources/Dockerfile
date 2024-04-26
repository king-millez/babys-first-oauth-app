FROM node:20.12-alpine3.18

WORKDIR /app
COPY package.json /app
COPY package-lock.json /app
COPY src/ /app/src
COPY views/ /app/views
COPY public/ /app/public
RUN npm ci
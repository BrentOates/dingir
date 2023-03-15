# Stage 1 - Build

FROM node:18 AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 - Dist Only

FROM node:18
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev
RUN npm install @napi-rs/canvas-linux-x64-gnu
COPY --from=build /usr/src/app/dist dist
ENTRYPOINT npm start

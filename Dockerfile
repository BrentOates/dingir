# Stage 1 - Build

FROM node:16 AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 - Dist Only

FROM node:16
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /usr/src/app/dist dist
ENTRYPOINT npm start

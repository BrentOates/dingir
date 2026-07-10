# Stage 1 - Build

FROM node:26-trixie-slim AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 - Dist Only

FROM node:26-trixie-slim AS dist
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /usr/src/app/dist dist
ENTRYPOINT ["npm", "start"]

# Stage 1 - Build

FROM node:20 AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 - Dist Only

FROM node:20 AS dist
ARG TARGETARCH
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev
RUN if [ "$TARGETARCH" = "amd64" ] ; then npm install @napi-rs/canvas-linux-x64-gnu ; else npm install @napi-rs/canvas-linux-${TARGETARCH}-gnu ; fi
COPY --from=build /usr/src/app/dist dist
ENTRYPOINT npm start
FROM node:24-trixie-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
RUN mkdir -p data && chown node:node data
USER node
VOLUME /usr/src/app/data
CMD ["node", "src/index.ts"]

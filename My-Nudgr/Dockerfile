FROM node:18-alpine AS base

WORKDIR /app

COPY package*.json ./

FROM base AS dependencies

RUN npm install --omit=dev

FROM base AS final

RUN mkdir -p ssl

RUN mkdir -p data

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

EXPOSE 6000
EXPOSE 6443

CMD [ "node", "server.js" ]

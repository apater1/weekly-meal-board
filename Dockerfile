FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

RUN mkdir -p /app/data

COPY server.js ./server.js
COPY public ./public
COPY README.md ./README.md

EXPOSE 10000

CMD ["node", "server.js"]

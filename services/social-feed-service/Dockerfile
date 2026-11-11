FROM node:20-alpine

WORKDIR /app

COPY services/social-feed-service/package*.json ./
RUN npm install --omit=dev

COPY services/social-feed-service/src ./services/social-feed-service/src
COPY services/social-service/src ./services/social-service/src

EXPOSE 5010

CMD ["node", "services/social-feed-service/src/index.js"]
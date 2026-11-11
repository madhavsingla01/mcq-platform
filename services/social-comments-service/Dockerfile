FROM node:20-alpine

WORKDIR /app

COPY services/social-comments-service/package*.json ./
RUN npm install --omit=dev

COPY services/social-comments-service/src ./services/social-comments-service/src
COPY services/social-service/src ./services/social-service/src

EXPOSE 5012

CMD ["node", "services/social-comments-service/src/index.js"]
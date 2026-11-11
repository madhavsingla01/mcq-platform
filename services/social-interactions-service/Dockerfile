FROM node:20-alpine

WORKDIR /app

COPY services/social-interactions-service/package*.json ./
RUN npm install --omit=dev

COPY services/social-interactions-service/src ./services/social-interactions-service/src
COPY services/social-service/src ./services/social-service/src

EXPOSE 5011

CMD ["node", "services/social-interactions-service/src/index.js"]
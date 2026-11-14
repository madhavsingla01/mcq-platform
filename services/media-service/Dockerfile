FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg
ENV MEDIA_FFMPEG_PATH=/usr/bin/ffmpeg MEDIA_FFPROBE_PATH=/usr/bin/ffprobe

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 5007

CMD ["npm", "start"]

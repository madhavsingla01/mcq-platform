FROM node:20-alpine

WORKDIR /app
RUN apk add --no-cache ffmpeg
ENV MEDIA_FFMPEG_PATH=/usr/bin/ffmpeg MEDIA_FFPROBE_PATH=/usr/bin/ffprobe

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 5007

CMD ["npm", "start"]

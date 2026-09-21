FROM node:22-alpine

# docker-entrypoint.sh에서 DB가 뜰 때까지 기다릴 때 pg_isready를 쓰기 위해 설치
RUN apk add --no-cache postgresql-client

WORKDIR /app

# 의존성 캐시를 최대한 활용하기 위해 package*.json만 먼저 복사해서 설치
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]

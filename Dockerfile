FROM postgres:16-alpine

# 이 이미지 하나 안에서 Postgres와 우리 Node 앱을 함께 실행한다 (컨테이너 1개).
RUN apk add --no-cache nodejs npm

WORKDIR /app

# 의존성 캐시를 최대한 활용하기 위해 package*.json만 먼저 복사해서 설치
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# 우리 앱 전용 entrypoint. postgres 공식 이미지가 이미 갖고 있는
# /usr/local/bin/docker-entrypoint.sh(Postgres 초기화 스크립트)는 그대로 두고,
# 이 스크립트가 그걸 백그라운드로 호출한 다음 우리 Node 앱도 같이 띄운다.
COPY docker-entrypoint-app.sh /usr/local/bin/docker-entrypoint-app.sh
RUN chmod +x /usr/local/bin/docker-entrypoint-app.sh

# 컨테이너 안에서 앱은 항상 같은 컨테이너의 Postgres(localhost)로 접속한다.
# (docker exec로 들어가서 create-admin.js 등을 실행할 때도 이 값이 그대로 적용됨)
ENV DB_HOST=127.0.0.1
ENV DB_PORT=5432
ENV PORT=3000
ENV NODE_ENV=production
# 호스트 볼륨을 /var/lib/postgresql/data에 직접 마운트해도 안전하도록,
# 실제 데이터는 그 안의 하위 폴더에 저장한다 (postgres 공식 이미지 권장 방식 —
# 볼륨 최상위에 lost+found 같은 게 있어도 initdb가 걸려 넘어지지 않게 하기 위함).
ENV PGDATA=/var/lib/postgresql/data/pgdata

EXPOSE 3000 5432

ENTRYPOINT ["docker-entrypoint-app.sh"]

#!/bin/sh
# 컨테이너 시작 시: 1) DB가 준비될 때까지 대기 → 2) 마이그레이션(테이블 생성/펜션 초기 데이터) 실행
#                → 3) 실제 서버 실행(node server.js). docker-compose의 healthcheck와는 별개로,
# 이 스크립트 자체도 DB 연결을 재시도하므로 compose 없이 `docker run`만으로 띄워도 안전하게 동작한다.
set -e

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-app_user}"
DB_NAME="${DB_NAME:-myapp_db}"

echo "⏳ PostgreSQL 연결 대기 중... ($DB_HOST:$DB_PORT)"
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; do
  sleep 1
done
echo "✅ PostgreSQL 연결 확인됨"

echo "🔧 마이그레이션 실행 중 (테이블 생성 + 펜션 초기 데이터)..."
node migrate.js

echo "🚀 서버 시작: $*"
exec "$@"
